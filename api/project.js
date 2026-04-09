// Vercel Serverless Function — invite, remove, role, usage-stats в один endpoint (лимит 12 на Hobby)
// POST { action: 'invite', projectId, username, userId, role? }
// POST { action: 'invite', projectId, email, userId, role? }
// POST { action: 'remove', projectId, memberId, userId }
// POST { action: 'role', projectId, memberId, role, userId }
// POST { action: 'usage-stats', userId, period? }
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

async function sendInviteTelegramNotification(supabase, projectName, inviteeUserId, memberId) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = 'https://ririrai.vercel.app';
  if (!botToken) return;

  const username = inviteeUserId.replace(/^tg-/, '');
  try {
    // Use persistent telegram_chats table instead of ephemeral getUpdates
    const { data: chatRow } = await supabase
      .from('telegram_chats')
      .select('chat_id')
      .eq('username', username)
      .maybeSingle();

    let chatId = chatRow?.chat_id || null;

    // Fallback to getUpdates if not in DB yet
    if (!chatId) {
      const updatesRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100`);
      const updatesData = await updatesRes.json();
      if (updatesData.ok && updatesData.result) {
        for (const u of updatesData.result) {
          const from = u.message?.from;
          if (from?.username?.toLowerCase() === username) {
            chatId = from.id;
            // Persist for future use
            await supabase.from('telegram_chats').upsert({
              username, chat_id: chatId,
              first_name: from.first_name || null,
              last_name: from.last_name || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'username' });
            break;
          }
        }
      }
    }
    if (!chatId) return;

    const inviteLink = `${appUrl}/invite?m=${memberId}`;
    const text = `👋 Тебя пригласили в проект «${projectName || 'Без названия'}»!\n\nОткрой приложение — проект уже появится у тебя слева в списке проектов.\n\nИли нажми напрямую:\n${inviteLink}`;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (_) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { action } = req.body || {};
  if (action === 'invite') return handleInvite(req, res, supabase);
  if (action === 'remove') return handleRemove(req, res, supabase);
  if (action === 'role') return handleRole(req, res, supabase);
  if (action === 'usage-stats') return handleUsageStats(req, res, supabaseUrl, supabaseServiceKey);
  if (action === 'user-token-stats') return handleUserTokenStats(req, res, supabaseUrl, supabaseServiceKey);
  if (action === 'token-spend-details') return handleTokenSpendDetails(req, res, supabaseUrl, supabaseServiceKey);
  if (action === 'timer-completed') return handleTimerCompleted(req, res, supabase);

  return res.status(400).json({ error: 'Unknown action', expected: ['invite', 'remove', 'role', 'usage-stats', 'user-token-stats', 'token-spend-details', 'timer-completed'] });
}

async function sendInviteEmailNotification(projectName, email, memberId) {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || 'noreply@resend.dev';
  const appUrl = 'https://ririrai.vercel.app';
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  const inviteLink = `${appUrl}/invite?m=${memberId}`;

  try {
    await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: `Вас пригласили в проект «${projectName || 'Без названия'}»`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #fff;">
          <h2 style="font-size: 22px; font-weight: 700; color: #1e293b; margin: 0 0 12px;">Вас пригласили в проект</h2>
          <p style="font-size: 16px; color: #475569; margin: 0 0 24px;">
            Вы получили приглашение в проект <strong style="color: #1e293b;">«${projectName || 'Без названия'}»</strong>.
          </p>
          <a href="${inviteLink}" style="display: inline-block; padding: 14px 28px; background: #475569; color: #fff; text-decoration: none; border-radius: 12px; font-size: 15px; font-weight: 600;">
            Открыть проект
          </a>
          <p style="font-size: 13px; color: #94a3b8; margin: 24px 0 0;">
            Или перейдите по ссылке: <a href="${inviteLink}" style="color: #475569;">${inviteLink}</a>
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Email invite]', err);
  }
}

async function handleInvite(req, res, supabase) {
  const { projectId, username, email, userId, role = 'write' } = req.body || {};
  const isEmailInvite = !!email && !username;

  if (!projectId || (!username && !email) || !userId) {
    return res.status(400).json({ error: 'Missing projectId, (username or email), userId' });
  }

  try {
    const { data: project, error: projectError } = await supabase.from('projects').select('owner_id, name').eq('id', projectId).single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found' });

    if (project.owner_id !== userId) {
      const { data: member } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).eq('status', 'active').single();
      if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const normalizedInviteeId = isEmailInvite
      ? `email-${email.trim().toLowerCase()}`
      : `tg-${(username.startsWith('@') ? username.slice(1) : username).trim().toLowerCase()}`;
    const validRole = ['read', 'write', 'admin'].includes(role) ? role : 'write';

    const { data: existing } = await supabase.from('project_members').select('id, status').eq('project_id', projectId).eq('user_id', normalizedInviteeId).maybeSingle();

    if (existing) {
      if (existing.status === 'active') return res.status(400).json({ error: 'User is already a member' });
      await supabase.from('project_members').update({ status: 'active', role: validRole, user_id: normalizedInviteeId, joined_at: new Date().toISOString() }).eq('id', existing.id);
      if (isEmailInvite) {
        await sendInviteEmailNotification(project.name, email.trim().toLowerCase(), existing.id);
      } else {
        await sendInviteTelegramNotification(supabase, project.name, normalizedInviteeId, existing.id);
      }
      return res.status(200).json({ success: true, message: 'Member reactivated', memberId: existing.id });
    }

    const { data: member, error: insertError } = await supabase.from('project_members').insert({
      project_id: projectId, user_id: normalizedInviteeId, role: validRole, invited_by: userId, status: 'pending',
    }).select().single();

    if (insertError) return res.status(500).json({ error: 'Failed to invite', details: insertError.message });
    if (!member) return res.status(500).json({ error: 'Insert succeeded but no data' });

    try {
      await supabase.from('project_changes').insert({
        project_id: projectId, user_id: userId, change_type: 'member_added', entity_type: 'member', entity_id: member.id, old_data: null, new_data: { user_id: normalizedInviteeId, role: validRole }, vector_clock: {},
      });
    } catch (_) {}
    await supabase.from('projects').update({ is_shared: true, shared_at: new Date().toISOString() }).eq('id', projectId);

    if (isEmailInvite) {
      await sendInviteEmailNotification(project.name, email.trim().toLowerCase(), member.id);
    } else {
      await sendInviteTelegramNotification(supabase, project.name, normalizedInviteeId, member.id);
    }

    const identifier = isEmailInvite ? email : username;
    return res.status(200).json({ success: true, member, message: `Invitation sent to ${identifier}` });
  } catch (err) {
    console.error('[Project invite]', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handleRemove(req, res, supabase) {
  const { projectId, memberId, userId } = req.body || {};
  if (!projectId || !memberId || !userId) return res.status(400).json({ error: 'Missing projectId, memberId, userId' });

  try {
    const { data: project } = await supabase.from('projects').select('owner_id').eq('id', projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { data: memberToRemove, error: fetchErr } = await supabase.from('project_members').select('*').eq('id', memberId).eq('project_id', projectId).single();
    if (fetchErr || !memberToRemove) return res.status(404).json({ error: 'Member not found' });
    if (memberToRemove.user_id === project.owner_id) return res.status(400).json({ error: 'Cannot remove project owner' });

    const isOwner = project.owner_id === userId;
    const isSelfRemoval = memberToRemove.user_id === userId;
    if (!isOwner && !isSelfRemoval) {
      const { data: member } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).eq('status', 'active').single();
      if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await supabase.from('project_members').update({ status: 'removed' }).eq('id', memberId).eq('project_id', projectId);
    try { await supabase.from('project_presence').delete().eq('project_id', projectId).eq('user_id', memberToRemove.user_id); } catch (_) {}
    try {
      await supabase.from('project_changes').insert({
        project_id: projectId, user_id: userId, change_type: 'member_removed', entity_type: 'member', entity_id: memberId, old_data: { user_id: memberToRemove.user_id, role: memberToRemove.role }, new_data: null, vector_clock: {},
      });
    } catch (_) {}

    return res.status(200).json({ success: true, message: 'Member removed successfully' });
  } catch (err) {
    console.error('[Project remove]', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handleRole(req, res, supabase) {
  const { projectId, memberId, role, userId } = req.body || {};
  if (!projectId || !memberId || !role || !userId) return res.status(400).json({ error: 'Missing projectId, memberId, role, userId' });
  if (!['read', 'write', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  try {
    const { data: project } = await supabase.from('projects').select('owner_id').eq('id', projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.owner_id !== userId) {
      const { data: member } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).eq('status', 'active').single();
      if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { data: memberToUpdate, error: fetchErr } = await supabase.from('project_members').select('*').eq('id', memberId).eq('project_id', projectId).single();
    if (fetchErr || !memberToUpdate) return res.status(404).json({ error: 'Member not found' });
    if (memberToUpdate.user_id === project.owner_id) return res.status(400).json({ error: 'Cannot change owner role' });

    await supabase.from('project_members').update({ role }).eq('id', memberId).eq('project_id', projectId);
    try {
      await supabase.from('project_changes').insert({
        project_id: projectId, user_id: userId, change_type: 'member_role_changed', entity_type: 'member', entity_id: memberId, old_data: { role: memberToUpdate.role }, new_data: { role }, vector_clock: {},
      });
    } catch (_) {}

    return res.status(200).json({ success: true, message: `Member role updated to ${role}` });
  } catch (err) {
    console.error('[Project role]', err);
    return res.status(500).json({ error: err.message });
  }
}

const ADMIN_USERNAME = 'sergeyzolotykh';

async function handleUsageStats(req, res, supabaseUrl, supabaseServiceKey) {
  const { userId, period } = req.body || {};

  if (!userId || userId.toLowerCase() !== ADMIN_USERNAME.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    let dateFilter = '';
    if (period && period !== 'all') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const since = new Date();
      since.setDate(since.getDate() - days);
      dateFilter = `&created_at=gte.${since.toISOString()}`;
    }

    const url = `${supabaseUrl}/rest/v1/api_usage_log?select=*&order=created_at.desc&limit=5000${dateFilter}`;
    const response = await fetch(url, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 404 || text.includes('does not exist')) {
        return res.status(404).json({ error: 'table_not_found', message: 'Запусти create_api_usage_log.sql в Supabase SQL Editor' });
      }
      return res.status(500).json({ error: 'Supabase query failed', details: text });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, rows: data });
  } catch (err) {
    console.error('[usage-stats]', err?.message);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}

async function handleUserTokenStats(req, res, supabaseUrl, supabaseServiceKey) {
  const { userId } = req.body || {};

  if (!userId || userId.toLowerCase() !== ADMIN_USERNAME.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const headers = {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    };

    // 1. Получаем всех пользователей с балансом токенов
    const usersUrl = `${supabaseUrl}/rest/v1/users?select=id,telegram_username,telegram_id,token_balance,created_at&order=token_balance.asc&limit=500`;
    const usersResp = await fetch(usersUrl, { headers });
    if (!usersResp.ok) {
      const text = await usersResp.text();
      return res.status(500).json({ error: 'Failed to fetch users', details: text });
    }
    const users = await usersResp.json();

    // 2. Получаем историю трат токенов из api_usage_log (последние 90 дней)
    const since90 = new Date();
    since90.setDate(since90.getDate() - 90);
    const logsUrl = `${supabaseUrl}/rest/v1/api_usage_log?select=user_id,calls_count,created_at&created_at=gte.${since90.toISOString()}&order=created_at.desc&limit=50000`;
    const logsResp = await fetch(logsUrl, { headers });
    let logs = [];
    if (logsResp.ok) {
      logs = await logsResp.json();
    }

    // 3. Рассчитываем статистику трат по неделям/месяцам для каждого пользователя
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Группируем логи по user_id
    const logsByUser = {};
    for (const log of logs) {
      const uid = log.user_id || 'unknown';
      if (!logsByUser[uid]) logsByUser[uid] = [];
      logsByUser[uid].push(log);
    }

    // Для каждого пользователя считаем:
    // - последний вход (last_active)
    // - потрачено токенов за неделю
    // - потрачено токенов за месяц
    // - потрачено токенов всего за 90 дней
    // Примечание: calls_count — количество API-запросов, не токенов.
    // Приближённо считаем calls_count как прокси трат.
    const userStats = users.map(user => {
      const uid = user.id;
      const userLogs = logsByUser[uid] || [];

      const lastLog = userLogs[0]; // уже отсортировано по desc
      const last_active = lastLog?.created_at || null;

      const spent_week = userLogs
        .filter(l => new Date(l.created_at) >= weekAgo)
        .reduce((sum, l) => sum + (l.calls_count || 1), 0);

      const spent_month = userLogs
        .filter(l => new Date(l.created_at) >= monthAgo)
        .reduce((sum, l) => sum + (l.calls_count || 1), 0);

      const spent_total_90d = userLogs
        .reduce((sum, l) => sum + (l.calls_count || 1), 0);

      return {
        id: uid,
        username: user.telegram_username || `tg_${user.telegram_id}` || 'unknown',
        token_balance: user.token_balance || 0,
        last_active,
        spent_week,
        spent_month,
        spent_total_90d,
        actions_count: userLogs.length,
      };
    });

    // Сортируем по активности (spent_month desc)
    userStats.sort((a, b) => b.spent_month - a.spent_month);

    return res.status(200).json({ success: true, users: userStats });
  } catch (err) {
    console.error('[user-token-stats]', err?.message);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}

/**
 * Детальная статистика трат токенов из token_transactions.
 * Возвращает:
 *   - rows: последние транзакции
 *   - byUser: { username -> { total, week, month, byAction: { action -> { tokens, count } } } }
 *   - byAction: { action -> { tokens, count, label, section } }
 *   - bySection: { section -> { tokens, count } }
 *   - daily: [{ date, tokens, count }] (последние 30 дней)
 */
async function handleTokenSpendDetails(req, res, supabaseUrl, supabaseServiceKey) {
  const { userId, period = '30d' } = req.body || {};

  if (!userId || userId.toLowerCase() !== ADMIN_USERNAME.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const headers = {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    };

    // Вычисляем дату начала периода
    const now = new Date();
    let sinceDate = new Date(0);
    if (period === '7d') sinceDate = new Date(now.getTime() - 7 * 86400000);
    else if (period === '30d') sinceDate = new Date(now.getTime() - 30 * 86400000);
    else if (period === '90d') sinceDate = new Date(now.getTime() - 90 * 86400000);

    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000);

    // Проверяем, существует ли таблица token_transactions
    let txRows = [];
    const txUrl = `${supabaseUrl}/rest/v1/token_transactions?select=id,user_id,tg_username,amount,action,section,label,created_at&created_at=gte.${sinceDate.toISOString()}&order=created_at.desc&limit=5000`;
    const txResp = await fetch(txUrl, { headers });
    if (txResp.ok) {
      txRows = await txResp.json();
    }

    // Получаем пользователей для маппинга user_id -> username
    const usersUrl = `${supabaseUrl}/rest/v1/users?select=id,telegram_username&limit=500`;
    const usersResp = await fetch(usersUrl, { headers });
    const usersRaw = usersResp.ok ? await usersResp.json() : [];
    const userMap = {};
    for (const u of usersRaw) {
      if (u.id) userMap[u.id] = u.telegram_username || u.id;
    }

    // Обогащаем tg_username из userMap если не заполнен
    for (const row of txRows) {
      if (!row.tg_username && row.user_id && userMap[row.user_id]) {
        row.tg_username = userMap[row.user_id];
      }
    }

    // byUser: username -> stat
    const byUser = {};
    for (const row of txRows) {
      const uname = row.tg_username || row.user_id || 'unknown';
      if (!byUser[uname]) byUser[uname] = { total: 0, week: 0, month: 0, byAction: {} };
      const ts = new Date(row.created_at);
      byUser[uname].total += row.amount;
      if (ts >= weekAgo) byUser[uname].week += row.amount;
      if (ts >= monthAgo) byUser[uname].month += row.amount;
      const act = row.action || 'unknown';
      if (!byUser[uname].byAction[act]) byUser[uname].byAction[act] = { tokens: 0, count: 0, label: row.label || act, section: row.section };
      byUser[uname].byAction[act].tokens += row.amount;
      byUser[uname].byAction[act].count += 1;
    }

    // byAction: action -> stat
    const byAction = {};
    for (const row of txRows) {
      const act = row.action || 'unknown';
      if (!byAction[act]) byAction[act] = { tokens: 0, count: 0, label: row.label || act, section: row.section };
      byAction[act].tokens += row.amount;
      byAction[act].count += 1;
    }

    // bySection: section -> stat
    const bySection = {};
    for (const row of txRows) {
      const sec = row.section || 'other';
      if (!bySection[sec]) bySection[sec] = { tokens: 0, count: 0 };
      bySection[sec].tokens += row.amount;
      bySection[sec].count += 1;
    }

    // daily: по дням
    const dailyMap = {};
    for (const row of txRows) {
      const date = row.created_at.slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { date, tokens: 0, count: 0 };
      dailyMap[date].tokens += row.amount;
      dailyMap[date].count += 1;
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    const totalTokens = txRows.reduce((s, r) => s + (r.amount || 0), 0);

    return res.status(200).json({
      success: true,
      totalTokens,
      rowCount: txRows.length,
      rows: txRows.slice(0, 100),  // последние 100 транзакций
      byUser,
      byAction,
      bySection,
      daily,
      tableExists: txResp.ok,
    });
  } catch (err) {
    console.error('[token-spend-details]', err?.message);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}

async function handleTimerCompleted(req, res, supabase) {
  const { videoId, projectId, completedBy, videoTitle } = req.body || {};
  if (!videoId || !projectId || !completedBy) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('name, project_manager_id, owner_id, user_id')
      .eq('id', projectId)
      .maybeSingle();

    const notifyUserId = project?.project_manager_id || project?.owner_id || project?.user_id;
    if (!notifyUserId) return res.status(200).json({ success: true, message: 'No one to notify' });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(200).json({ success: true, message: 'No bot token' });

    const username = notifyUserId.replace(/^tg-/, '').replace(/^@/, '').toLowerCase();
    const { data: chatRow } = await supabase
      .from('telegram_chats')
      .select('chat_id')
      .eq('username', username)
      .maybeSingle();

    if (!chatRow?.chat_id) return res.status(200).json({ success: true, message: 'PM chat_id not found' });

    const cleanName = completedBy.replace(/^tg-/, '').replace(/^@/, '');
    const titleRaw = videoTitle || 'Без названия';
    const titleShort = titleRaw.length > 80 ? titleRaw.slice(0, 80) + '…' : titleRaw;
    const text = `✅ <b>Видео обработано</b>\n\n📹 ${titleShort}\n📁 Проект: ${project.name || 'Без названия'}\n👤 Ответственный: @${cleanName}\n\nОтветственный отметил видео как готовое.`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatRow.chat_id, text, parse_mode: 'HTML' }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[timer-completed]', err?.message);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
