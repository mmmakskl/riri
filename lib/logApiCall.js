/**
 * Логирование вызовов внешних API в таблицу api_usage_log (Supabase).
 * Вызывается из serverless-функций после успешного запроса.
 * Ошибки логирования не прерывают основной flow — все проблемы только console.error.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * @param {object} params
 * @param {string} params.apiName     - 'rapidapi' | 'assemblyai' | 'openrouter'
 * @param {string} params.action      - 'reel-info' | 'user-reels' | 'search' | 'hashtag' | 'download' | 'transcribe' | 'translate' | 'script' | 'scriptwriter'
 * @param {number} [params.callsCount=1] - сколько реальных HTTP запросов к внешнему API (для пагинации)
 * @param {string} [params.userId]    - telegram user id или другой идентификатор
 * @param {string} [params.projectId]
 * @param {object} [params.metadata]  - доп. данные (shortcode, keyword, model и т.д.)
 */
export async function logApiCall({ apiName, action, callsCount = 1, userId, projectId, metadata } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // В dev-режиме ключи могут отсутствовать — не блокируем
    return;
  }

  try {
    const body = JSON.stringify({
      api_name: apiName,
      action,
      calls_count: callsCount,
      user_id: userId || null,
      project_id: projectId || null,
      metadata: metadata || null,
    });

    await fetch(`${SUPABASE_URL}/rest/v1/api_usage_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body,
    });
  } catch (err) {
    console.error('[logApiCall] Failed to log:', err?.message);
  }
}
