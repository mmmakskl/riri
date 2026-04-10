-- Добавляет колонку ai_hooks для сохранения результатов ИИ-хук в карточке видео
ALTER TABLE saved_videos ADD COLUMN IF NOT EXISTS ai_hooks JSONB;
