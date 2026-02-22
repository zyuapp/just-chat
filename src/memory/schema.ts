import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const conversationsTable = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    channel: text("channel").notNull(),
    channelUserId: text("channel_user_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull()
  },
  (table) => ({
    channelUserIdx: uniqueIndex("conversations_channel_user_idx").on(table.channel, table.channelUserId)
  })
);

export const messagesTable = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    requestId: text("request_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    toolName: text("tool_name"),
    createdAt: integer("created_at").notNull()
  },
  (table) => ({
    conversationTimeIdx: index("messages_conversation_time_idx").on(table.conversationId, table.createdAt)
  })
);

export const toolRunsTable = sqliteTable(
  "tool_runs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    requestId: text("request_id").notNull(),
    tool: text("tool").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    inputJson: text("input_json").notNull(),
    outputJson: text("output_json").notNull(),
    createdAt: integer("created_at").notNull()
  },
  (table) => ({
    conversationTimeIdx: index("tool_runs_conversation_time_idx").on(table.conversationId, table.createdAt)
  })
);

export const agentRunsTable = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    requestId: text("request_id").notNull(),
    status: text("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    modelCalls: integer("model_calls").notNull(),
    modelRetries: integer("model_retries").notNull(),
    toolCalls: integer("tool_calls").notNull(),
    toolRetries: integer("tool_retries").notNull(),
    toolErrors: integer("tool_errors").notNull(),
    errorMessage: text("error_message"),
    createdAt: integer("created_at").notNull()
  },
  (table) => ({
    conversationTimeIdx: index("agent_runs_conversation_time_idx").on(table.conversationId, table.createdAt)
  })
);

export const settingsTable = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const memorySchema = {
  conversationsTable,
  messagesTable,
  toolRunsTable,
  agentRunsTable,
  settingsTable
};
