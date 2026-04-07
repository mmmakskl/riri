// Vercel Serverless Function — уведомление проджект-менеджеру о завершении таймера
// POST { action: 'completed', videoId, projectId, completedBy, videoTitle }
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function sendTelegramMessage(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !chatId) return;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function getChatId(supabase, userId) {
  const username = userId.replace(/^tg-/, '').replace(/^@/, '').toLowerCase();
  const { data } = await supabase
    .from('telegram_chats')
    .select('chat_id')
    .eq('username', username)
    .maybeSingle();
  return data?.chat_id ?? null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, videoId, projectId, completedBy, videoTitle } = req.body || {};

  if (action !== 'completed') {
    return res.status(400).json({ error: 'Unknown action' });
  }

  if (!videoId || !projectId || !completedBy) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Получаем project_manager_id из проекта
    const { data: project } = await supabase
      .from('projects')
      .select('name, project_manager_id, owner_id, user_id')
      .eq('id', projectId)
      .maybeSingle();

    // Если нет проджекта — уведомляем создателя
    const notifyUserId = project?.project_manager_id || project?.owner_id || project?.user_id;
    if (!notifyUserId) {
      return res.status(200).json({ success: true, message: 'No one to notify' });
    }

    // Получаем chat_id проджекта (или создателя)
    const pmChatId = await getChatId(supabase, notifyUserId);
    if (!pmChatId) {
      return res.status(200).json({ success: true, message: 'PM chat_id not found' });
    }

    // Форматируем имя ответственного
    const cleanName = completedBy.replace(/^tg-/, '').replace(/^@/, '');

    const text = `✅ <b>Видео обработано</b>\n\n` +
      `📹 ${videoTitle || 'Без названия'}\n` +
      `📁 Проект: ${project.name || 'Без названия'}\n` +
      `👤 Ответственный: @${cleanName}\n\n` +
      `Ответственный отметил видео как готовое.`;

    await sendTelegramMessage(pmChatId, text);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('responsible-timer error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
