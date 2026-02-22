import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Message, ToolCall } from "ollama";
import type { ToolExecutionEnvelope } from "../tools/registry.js";
import { ensureDatabaseSchema } from "./bootstrap.js";
import {
  agentRunsTable,
  conversationsTable,
  memorySchema,
  messagesTable,
  settingsTable,
  toolRunsTable
} from "./schema.js";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "app.db");

type MessageRole = "user" | "assistant" | "tool";

type CreateMemoryStoreOptions = {
  dbPath?: string;
  now?: () => number;
};

type SaveMessageInput = {
  conversationId: string;
  requestId: string;
  role: MessageRole;
  content: string;
  toolName?: string;
};

type SaveToolRunInput = {
  conversationId: string;
  requestId: string;
  toolCall: ToolCall;
  envelope: ToolExecutionEnvelope;
};

type SaveAgentRunInput = {
  conversationId: string;
  requestId: string;
  status: "success" | "error";
  durationMs: number;
  modelCalls: number;
  modelRetries: number;
  toolCalls: number;
  toolRetries: number;
  toolErrors: number;
  errorMessage?: string;
};

export type MemoryStore = {
  getOrCreateConversation: (channel: string, channelUserId: string) => string;
  listRecentMessages: (conversationId: string, limit: number) => Message[];
  saveMessage: (input: SaveMessageInput) => void;
  saveToolRun: (input: SaveToolRunInput) => void;
  saveAgentRun: (input: SaveAgentRunInput) => void;
  setSetting: (key: string, value: unknown) => void;
  getSetting: (key: string) => unknown | null;
  close: () => void;
};

function createDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema: memorySchema });
}

type MemoryDb = ReturnType<typeof createDb>;

type MemoryContext = {
  db: MemoryDb;
  now: () => number;
};

function toOllamaMessage(row: { role: string; content: string; toolName: string | null }): Message {
  if (row.role === "tool" && row.toolName) {
    return {
      role: "tool",
      tool_name: row.toolName,
      content: row.content
    };
  }

  return { role: row.role, content: row.content };
}

function touchConversation(db: MemoryDb, conversationId: string, timestamp: number): void {
  db.update(conversationsTable)
    .set({ updatedAt: timestamp })
    .where(eq(conversationsTable.id, conversationId))
    .run();
}

function getOrCreateConversation(context: MemoryContext, channel: string, channelUserId: string): string {
  const existing = context.db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.channel, channel), eq(conversationsTable.channelUserId, channelUserId)))
    .limit(1)
    .get();

  if (existing) {
    return existing.id;
  }

  const id = randomUUID();
  const timestamp = context.now();

  context.db.insert(conversationsTable)
    .values({
      id,
      channel,
      channelUserId,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .run();

  return id;
}

function listRecentMessages(context: MemoryContext, conversationId: string, limit: number): Message[] {
  const rows = context.db
    .select({ role: messagesTable.role, content: messagesTable.content, toolName: messagesTable.toolName })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit)
    .all();

  return rows.reverse().map(toOllamaMessage);
}

function saveMessage(context: MemoryContext, input: SaveMessageInput): void {
  const timestamp = context.now();

  context.db.insert(messagesTable)
    .values({
      id: randomUUID(),
      conversationId: input.conversationId,
      requestId: input.requestId,
      role: input.role,
      content: input.content,
      toolName: input.toolName ?? null,
      createdAt: timestamp
    })
    .run();

  touchConversation(context.db, input.conversationId, timestamp);
}

function saveToolRun(context: MemoryContext, input: SaveToolRunInput): void {
  const timestamp = context.now();
  const errorCode = input.envelope.ok ? null : input.envelope.error.code;
  const errorMessage = input.envelope.ok ? null : input.envelope.error.message;

  context.db.insert(toolRunsTable)
    .values({
      id: randomUUID(),
      conversationId: input.conversationId,
      requestId: input.requestId,
      tool: input.toolCall.function.name,
      ok: input.envelope.ok,
      durationMs: input.envelope.durationMs,
      errorCode,
      errorMessage,
      inputJson: JSON.stringify(input.toolCall.function.arguments ?? {}),
      outputJson: JSON.stringify(input.envelope),
      createdAt: timestamp
    })
    .run();

  touchConversation(context.db, input.conversationId, timestamp);
}

function saveAgentRun(context: MemoryContext, input: SaveAgentRunInput): void {
  const timestamp = context.now();

  context.db.insert(agentRunsTable)
    .values({
      id: randomUUID(),
      conversationId: input.conversationId,
      requestId: input.requestId,
      status: input.status,
      durationMs: input.durationMs,
      modelCalls: input.modelCalls,
      modelRetries: input.modelRetries,
      toolCalls: input.toolCalls,
      toolRetries: input.toolRetries,
      toolErrors: input.toolErrors,
      errorMessage: input.errorMessage ?? null,
      createdAt: timestamp
    })
    .run();

  touchConversation(context.db, input.conversationId, timestamp);
}

function setSetting(context: MemoryContext, key: string, value: unknown): void {
  const timestamp = context.now();

  context.db.insert(settingsTable)
    .values({ key, valueJson: JSON.stringify(value), updatedAt: timestamp })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { valueJson: JSON.stringify(value), updatedAt: timestamp }
    })
    .run();
}

function getSetting(context: MemoryContext, key: string): unknown | null {
  const row = context.db
    .select({ valueJson: settingsTable.valueJson })
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .limit(1)
    .get();

  if (!row) {
    return null;
  }

  return JSON.parse(row.valueJson);
}

function createSqlite(dbPath: string): Database.Database {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  ensureDatabaseSchema(sqlite);
  return sqlite;
}

export function createMemoryStore(options: CreateMemoryStoreOptions = {}): MemoryStore {
  const sqlite = createSqlite(options.dbPath ?? DEFAULT_DB_PATH);
  const context: MemoryContext = {
    db: createDb(sqlite),
    now: options.now ?? Date.now
  };

  return {
    getOrCreateConversation: (channel, channelUserId) => getOrCreateConversation(context, channel, channelUserId),
    listRecentMessages: (conversationId, limit) => listRecentMessages(context, conversationId, limit),
    saveMessage: (input) => saveMessage(context, input),
    saveToolRun: (input) => saveToolRun(context, input),
    saveAgentRun: (input) => saveAgentRun(context, input),
    setSetting: (key, value) => setSetting(context, key, value),
    getSetting: (key) => getSetting(context, key),
    close: () => sqlite.close()
  };
}
