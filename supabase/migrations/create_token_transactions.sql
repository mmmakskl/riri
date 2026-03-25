-- Таблица для детального логирования трат токенов
-- Запускать в Supabase SQL Editor

CREATE TABLE IF NOT EXISTS token_transactions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tg_username TEXT,
  amount      INTEGER NOT NULL,       -- сколько токенов списано
  action      TEXT NOT NULL,          -- тип действия (ключ из tokenCosts.ts)
  section     TEXT,                   -- раздел приложения (lenta, radar, analytics, etc.)
  label       TEXT,                   -- человеко-читаемое описание кнопки
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Индексы для быстрых аналитических запросов
CREATE INDEX IF NOT EXISTS idx_token_tx_user_id   ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_tx_tg_user   ON token_transactions(tg_username);
CREATE INDEX IF NOT EXISTS idx_token_tx_created   ON token_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_tx_action    ON token_transactions(action);
CREATE INDEX IF NOT EXISTS idx_token_tx_section   ON token_transactions(section);

-- RLS
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

-- Пользователь может читать только свои транзакции
CREATE POLICY "Users read own transactions"
  ON token_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Пользователь может вставлять только свои транзакции
CREATE POLICY "Users insert own transactions"
  ON token_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role может всё (для admin API)
CREATE POLICY "Service role full access"
  ON token_transactions
  USING (true)
  WITH CHECK (true);
