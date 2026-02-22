import type { Message, ToolCall } from "ollama";
import type { ToolExecutionEnvelope } from "../tools/registry.js";

export type MessageRole = "user" | "assistant" | "tool";

export type CreateMemoryStoreOptions = {
  dbPath?: string;
  now?: () => number;
};

export type SaveMessageInput = {
  conversationId: string;
  requestId: string;
  role: MessageRole;
  content: string;
  toolName?: string;
};

export type SaveToolRunInput = {
  conversationId: string;
  requestId: string;
  toolCall: ToolCall;
  envelope: ToolExecutionEnvelope;
};

export type SaveAgentRunInput = {
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

export type SaveMemoryChunkInput = {
  conversationId: string;
  requestId: string;
  sourceRole: "user" | "assistant" | "tool";
  content: string;
  embedding: number[];
};

export type MemoryChunkRecord = {
  id: string;
  requestId: string;
  sourceRole: string;
  content: string;
  embedding: number[];
  createdAt: number;
};

export type MemoryStore = {
  getOrCreateConversation: (channel: string, channelUserId: string) => string;
  listRecentMessages: (conversationId: string, limit: number) => Message[];
  saveMessage: (input: SaveMessageInput) => void;
  saveToolRun: (input: SaveToolRunInput) => void;
  saveAgentRun: (input: SaveAgentRunInput) => void;
  saveMemoryChunk: (input: SaveMemoryChunkInput) => void;
  listRecentMemoryChunks: (conversationId: string, limit: number) => MemoryChunkRecord[];
  setSetting: (key: string, value: unknown) => void;
  getSetting: (key: string) => unknown | null;
  close: () => void;
};
