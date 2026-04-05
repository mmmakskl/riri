-- Карусели редактора для совместной работы в проекте
CREATE TABLE IF NOT EXISTS project_carousels (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Черновик',
  slides JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_carousels_project_id ON project_carousels(project_id);
CREATE INDEX IF NOT EXISTS idx_project_carousels_updated_at ON project_carousels(updated_at DESC);

-- RLS: все участники проекта могут читать/писать
ALTER TABLE project_carousels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_carousels_select" ON project_carousels FOR SELECT USING (true);
CREATE POLICY "project_carousels_insert" ON project_carousels FOR INSERT WITH CHECK (true);
CREATE POLICY "project_carousels_update" ON project_carousels FOR UPDATE USING (true);
CREATE POLICY "project_carousels_delete" ON project_carousels FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE project_carousels;
