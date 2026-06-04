export const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  amo_contact_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
ON users(username)
WHERE username IS NOT NULL AND username != '';

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  business_connection_id TEXT,
  amo_lead_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Новый лид',
  assigned_to TEXT NOT NULL DEFAULT 'бот',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_chat
ON conversations(telegram_chat_id, business_connection_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  text TEXT NOT NULL,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  intent TEXT NOT NULL,
  is_hot INTEGER NOT NULL DEFAULT 0,
  fear TEXT,
  destination TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(message_id) REFERENCES messages(id)
);

CREATE TABLE IF NOT EXISTS delayed_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(message_id) REFERENCES messages(id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_delayed_responses_due
ON delayed_responses(status, due_at);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('scripted_auto_send', 'ai_auto_send', 'human_handoff')),
  decision TEXT,
  intent TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  risk_level TEXT,
  client_mood TEXT,
  detected_fear TEXT,
  risk_flags TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  answer_text TEXT,
  assistant_note TEXT,
  forbidden_triggered INTEGER NOT NULL DEFAULT 0,
  draft_text TEXT,
  final_text TEXT,
  model TEXT,
  raw_ai_json TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(message_id) REFERENCES messages(id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS scripted_response_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  matched_intent TEXT NOT NULL,
  matched_variant_id TEXT,
  mode TEXT NOT NULL CHECK(mode IN ('scripted_auto_send', 'ai_auto_send', 'human_handoff')),
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  was_sent INTEGER NOT NULL DEFAULT 0,
  handoff_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id),
  FOREIGN KEY(message_id) REFERENCES messages(id)
);
`;
