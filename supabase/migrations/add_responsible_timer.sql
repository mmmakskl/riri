-- Таймер ответственного: 24 часа на обработку видео
-- responsible_assigned_at — когда ответственный назначен (сбрасывается при перемещении по папкам)
-- responsible_timer_done — отвественный отметил что видео готово
-- responsible_timer_done_at — когда отметил

ALTER TABLE saved_videos
  ADD COLUMN IF NOT EXISTS responsible_assigned_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS responsible_timer_done BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS responsible_timer_done_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS responsible_notified_at TIMESTAMPTZ DEFAULT NULL;

-- Проджект-менеджер проекта — получает уведомления о просрочках
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_manager_id TEXT DEFAULT NULL;

-- Индекс для быстрого поиска видео с активным таймером (для Edge Function)
CREATE INDEX IF NOT EXISTS idx_saved_videos_responsible_timer
  ON saved_videos (responsible_assigned_at)
  WHERE responsible_assigned_at IS NOT NULL
    AND responsible_timer_done = FALSE;
