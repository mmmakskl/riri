-- Таблица черновиков сценариев (ИИ-сценарист)
CREATE TABLE IF NOT EXISTS script_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  style_id TEXT,
  title TEXT NOT NULL DEFAULT 'Без названия',
  script_text TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  chat_history JSONB DEFAULT '[]',
  source_type TEXT,
  source_data JSONB DEFAULT '{}',
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_script_drafts_project ON script_drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_script_drafts_user ON script_drafts(user_id);

ALTER TABLE script_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drafts"
  ON script_drafts FOR SELECT
  USING (user_id = current_setting('app.user_id', true));

CREATE POLICY "Users can insert own drafts"
  ON script_drafts FOR INSERT
  WITH CHECK (user_id = current_setting('app.user_id', true));

CREATE POLICY "Users can update own drafts"
  ON script_drafts FOR UPDATE
  USING (user_id = current_setting('app.user_id', true));

CREATE POLICY "Users can delete own drafts"
  ON script_drafts FOR DELETE
  USING (user_id = current_setting('app.user_id', true));

-- Участники проекта тоже могут видеть черновики проекта
CREATE POLICY "Project members can view drafts"
  ON script_drafts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = script_drafts.project_id
        AND project_members.user_id = current_setting('app.user_id', true)
        AND project_members.status = 'active'
    )
  );
