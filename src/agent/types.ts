import type { ChatResponse, Message, Tool, ToolCall } from "ollama";
import type { ToolExecutionEnvelope } from "../tools/registry.js";

export type AgentTurnMeta = {
  durationMs: number;
  modelCalls: number;
  modelRetries: number;
  toolCalls: number;
  toolRetries: number;
  toolErrors: number;
};

export type AgentTurnResult =
  | {
      kind: "success";
      text: string;
      meta: AgentTurnMeta;
    }
  | {
      kind: "error";
      text: string;
      meta: AgentTurnMeta;
    };

export type ToolExecutor = (toolCall: ToolCall) => Promise<ToolExecutionEnvelope>;

export type OnToolResult = (toolCall: ToolCall, envelope: ToolExecutionEnvelope) => Promise<void>;

export type ChatClient = {
  chat: (params: {
    model: string;
    messages: Message[];
    tools?: Tool[];
    stream: false;
  }) => Promise<ChatResponse>;
};
