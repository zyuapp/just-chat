import type Database from "better-sqlite3";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    channel TEXT NOT NULL,
    channel_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_user_idx ON conversations(channel, channel_user_id)",
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_name TEXT,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS messages_conversation_time_idx ON messages(conversation_id, created_at)",
  `CREATE TABLE IF NOT EXISTS tool_runs (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    ok INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    error_code TEXT,
    error_message TEXT,
    input_json TEXT NOT NULL,
    output_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS tool_runs_conversation_time_idx ON tool_runs(conversation_id, created_at)",
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    model_calls INTEGER NOT NULL,
    model_retries INTEGER NOT NULL,
    tool_calls INTEGER NOT NULL,
    tool_retries INTEGER NOT NULL,
    tool_errors INTEGER NOT NULL,
    error_message TEXT,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS agent_runs_conversation_time_idx ON agent_runs(conversation_id, created_at)",
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS memory_chunks (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    source_role TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS memory_chunks_conversation_time_idx ON memory_chunks(conversation_id, created_at)"
];

export function ensureDatabaseSchema(database: Database.Database): void {
  for (const statement of schemaStatements) {
    database.exec(statement);
  }
}
