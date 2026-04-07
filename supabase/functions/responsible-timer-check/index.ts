// Supabase Edge Function — Проверка таймера ответственных (24ч)
// Запускается pg_cron каждый час (или по расписанию)
// Находит видео, где:
//   1. responsible_assigned_at + 24ч < now()
//   2. responsible_timer_done = false
//   3. Есть хотя бы один ответственный
//   4. У проекта есть project_manager_id
// Отправляет уведомление ответственному и проджект-менеджеру через Telegram бота

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function sendTelegramMessage(chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function getChatId(supabase: ReturnType<typeof createClient>, username: string): Promise<number | null> {
  const clean = username.replace(/^tg-/, '').replace(/^@/, '').toLowerCase();
  const { data } = await supabase
    .from('telegram_chats')
    .select('chat_id')
    .eq('username', clean)
    .maybeSingle();
  return data?.chat_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Находим просроченные видео: assigned_at + 24ч < now(), не отмечены как готово
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: overdueVideos, error } = await supabase
    .from('saved_videos')
    .select('id, caption, owner_username, project_id, responsibles, responsible_assigned_at, responsible_notified_at')
    .eq('responsible_timer_done', false)
    .not('responsible_assigned_at', 'is', null)
    .lt('responsible_assigned_at', cutoff)
    .is('responsible_notified_at', null)
    .not('responsibles', 'is', null)
    .not('project_id', 'is', null);

  if (error) {
    console.error('Error fetching overdue videos:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!overdueVideos || overdueVideos.length === 0) {
    return new Response(JSON.stringify({ success: true, message: 'Нет просроченных видео', count: 0 }));
  }

  console.log(`Найдено ${overdueVideos.length} просроченных видео`);

  // Собираем project_ids для загрузки проджектов
  const projectIds = [...new Set(overdueVideos.map(v => v.project_id).filter(Boolean))];
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, project_manager_id, owner_id, user_id')
    .in('id', projectIds);

  const projectMap = new Map((projects ?? []).map(p => [p.id, p]));
  let notified = 0;

  for (const video of overdueVideos) {
    const project = projectMap.get(video.project_id);
    if (!project) continue;
    // Если нет проджект-менеджера — уведомляем создателя проекта
    const notifyUserId = project.project_manager_id || project.owner_id || project.user_id;
    if (!notifyUserId) continue;

    const responsibles: { templateId?: string; value: string }[] = Array.isArray(video.responsibles) ? video.responsibles : [];
    const activeResponsibles = responsibles.filter(r => r.value?.trim());
    if (activeResponsibles.length === 0) continue;

    const videoTitle = video.caption
      ? video.caption.slice(0, 60) + (video.caption.length > 60 ? '…' : '')
      : video.owner_username
        ? `@${video.owner_username}`
        : 'Без названия';

    const responsibleNames = activeResponsibles.map(r => r.value).join(', ');

    // Уведомление проджект-менеджеру (или создателю проекта)
    const pmChatId = await getChatId(supabase, notifyUserId);
    if (pmChatId) {
      const pmText = `⏰ <b>Просрочка по видео</b>\n\n` +
        `📹 ${videoTitle}\n` +
        `📁 Проект: ${project.name || 'Без названия'}\n` +
        `👤 Ответственный: ${responsibleNames}\n\n` +
        `Видео не обработано более 24 часов.`;
      await sendTelegramMessage(pmChatId, pmText);
      notified++;
    }

    // Уведомление каждому ответственному
    for (const resp of activeResponsibles) {
      const respChatId = await getChatId(supabase, resp.value);
      if (respChatId) {
        const respText = `⏰ <b>Напоминание</b>\n\n` +
          `📹 ${videoTitle}\n` +
          `📁 Проект: ${project.name || 'Без названия'}\n\n` +
          `Видео назначено на тебя более 24 часов назад и ещё не обработано.\n` +
          `Перемести его в нужную папку или отметь как готовое в приложении.`;
        await sendTelegramMessage(respChatId, respText);
      }
    }

    // Помечаем что уведомление отправлено — чтобы не спамить повторно
    await supabase
      .from('saved_videos')
      .update({ responsible_notified_at: new Date().toISOString() })
      .eq('id', video.id);
  }

  return new Response(JSON.stringify({
    success: true,
    message: `Отправлено уведомлений: ${notified}`,
    totalOverdue: overdueVideos.length,
    notified,
  }));
});
