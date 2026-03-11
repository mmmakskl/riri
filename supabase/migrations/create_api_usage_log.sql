-- API Usage Log: tracks all external API calls (RapidAPI, AssemblyAI, OpenRouter)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS api_usage_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text,
  project_id  text,
  api_name    text NOT NULL,   -- 'rapidapi' | 'assemblyai' | 'openrouter'
  action      text NOT NULL,   -- 'reel-info' | 'user-reels' | 'search' | 'hashtag' | 'transcribe' | 'translate' | 'script' | 'scriptwriter'
  calls_count integer NOT NULL DEFAULT 1,  -- кол-во реальных запросов к внешнему API (важно для пагинации user-reels)
  metadata    jsonb,           -- доп. данные: username, shortcode, keyword, model и т.д.
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- Индексы для быстрых запросов статистики
CREATE INDEX IF NOT EXISTS api_usage_log_user_id_idx        ON api_usage_log (user_id);
CREATE INDEX IF NOT EXISTS api_usage_log_created_at_idx     ON api_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_log_api_name_idx       ON api_usage_log (api_name);

-- RLS: только авторизованные пользователи видят свои записи; сервис-роль пишет все
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

-- Сервисный ключ (API роуты) может писать всё
CREATE POLICY "service role can insert" ON api_usage_log
  FOR INSERT
  WITH CHECK (true);

-- Каждый пользователь видит только свои записи
CREATE POLICY "users read own logs" ON api_usage_log
  FOR SELECT
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub'
      OR user_id = auth.uid()::text);

-- Суперпользователь (для дашборда) — отдельная политика по user_id = 'admin'
-- Если нужно дать одному юзеру видеть всё — добавь его telegram id сюда:
-- CREATE POLICY "admin read all" ON api_usage_log FOR SELECT USING (auth.uid()::text = 'YOUR_ADMIN_USER_ID');
