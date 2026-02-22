import type { ChatResponse, Message, Tool, ToolCall } from "ollama";
import type { Logger } from "pino";
import type { ToolExecutionEnvelope } from "../tools/registry.js";
import { getErrorMessage, isTransientErrorMessage } from "../tools/common.js";
import { appendAssistantReply } from "./history.js";
import type {
  AgentTurnMeta,
  AgentTurnResult,
  ChatClient,
  OnToolResult,
  ToolExecutor
} from "./types.js";

export type { AgentTurnMeta, AgentTurnResult, ChatClient, ToolExecutor };

const MAX_TOOL_LOOP_STEPS = 5;
const MAX_MODEL_RETRIES = 2;
const MAX_TOOL_RETRIES = 2;
const RETRY_DELAY_MS = 150;

type HandleUserMessageParams = {
  client: ChatClient;
  logger: Logger;
  model: string;
  history: Message[];
  userInput: string;
  requestId: string;
  contextNote?: string;
  tools: Tool[];
  executeToolCall: ToolExecutor;
  onToolResult?: OnToolResult;
};

type ChatAttemptResult = {
  response: ChatResponse;
  attempts: number;
  retries: number;
};

type ToolAttemptResult = {
  envelope: ToolExecutionEnvelope;
  retries: number;
};

type TurnStats = {
  modelCalls: number;
  modelRetries: number;
  toolCalls: number;
  toolRetries: number;
  toolErrors: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTurnStats(): TurnStats {
  return {
    modelCalls: 0,
    modelRetries: 0,
    toolCalls: 0,
    toolRetries: 0,
    toolErrors: 0
  };
}

function trackModelAttempt(stats: TurnStats, result: ChatAttemptResult): void {
  stats.modelCalls += result.attempts;
  stats.modelRetries += result.retries;
}

function trackToolAttempt(stats: TurnStats, result: ToolAttemptResult): void {
  stats.toolCalls += 1;
  stats.toolRetries += result.retries;

  if (!result.envelope.ok) {
    stats.toolErrors += 1;
  }
}

function appendToolResultMessage(history: Message[], toolCall: ToolCall, envelope: ToolExecutionEnvelope): void {
  history.push({
    role: "tool",
    tool_name: toolCall.function.name,
    content: JSON.stringify(envelope)
  });
}

function logTurnCompletion(
  logger: Logger,
  requestId: string,
  status: "success" | "error",
  durationMs: number,
  stats: TurnStats,
  message?: string
): void {
  logger.info({
    event: "turn_completed",
    requestId,
    status,
    durationMs,
    modelCalls: stats.modelCalls,
    modelRetries: stats.modelRetries,
    toolCalls: stats.toolCalls,
    toolRetries: stats.toolRetries,
    toolErrors: stats.toolErrors,
    ...(message === undefined ? {} : { message })
  });
}

function toTurnMeta(durationMs: number, stats: TurnStats): AgentTurnMeta {
  return {
    durationMs,
    modelCalls: stats.modelCalls,
    modelRetries: stats.modelRetries,
    toolCalls: stats.toolCalls,
    toolRetries: stats.toolRetries,
    toolErrors: stats.toolErrors
  };
}

function buildSuccessTurnResult(
  logger: Logger,
  requestId: string,
  startedAt: number,
  stats: TurnStats,
  text: string
): AgentTurnResult {
  const durationMs = Date.now() - startedAt;
  logTurnCompletion(logger, requestId, "success", durationMs, stats);
  return { kind: "success", text, meta: toTurnMeta(durationMs, stats) };
}

function buildErrorTurnResult(
  logger: Logger,
  requestId: string,
  startedAt: number,
  stats: TurnStats,
  error: unknown
): AgentTurnResult {
  const message = getErrorMessage(error);
  const durationMs = Date.now() - startedAt;
  logTurnCompletion(logger, requestId, "error", durationMs, stats, message);
  return { kind: "error", text: message, meta: toTurnMeta(durationMs, stats) };
}

function buildModelMessages(history: Message[], contextNote?: string): Message[] {
  if (!contextNote) {
    return history;
  }

  return [
    {
      role: "system",
      content: contextNote
    },
    ...history
  ];
}

async function chatWithRetry(
  client: ChatClient,
  logger: Logger,
  requestId: string,
  model: string,
  messages: Message[],
  tools?: Tool[]
): Promise<ChatAttemptResult> {
  for (let attempt = 0; attempt <= MAX_MODEL_RETRIES; attempt += 1) {
    try {
      const response = await client.chat({
        model,
        messages,
        ...(tools === undefined ? {} : { tools }),
        stream: false
      });

      return {
        response,
        attempts: attempt + 1,
        retries: attempt
      };
    } catch (error) {
      const message = getErrorMessage(error);
      const retryable = isTransientErrorMessage(message);
      logger.warn({ event: "model_call_error", requestId, attempt: attempt + 1, retryable, message });

      if (!retryable || attempt >= MAX_MODEL_RETRIES) {
        throw error;
      }

      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error("Model retry loop exited unexpectedly");
}

async function executeToolCallWithRetry(
  executeToolCall: ToolExecutor,
  logger: Logger,
  requestId: string,
  toolCall: ToolCall
): Promise<ToolAttemptResult> {
  for (let attempt = 0; attempt <= MAX_TOOL_RETRIES; attempt += 1) {
    const envelope = await executeToolCall(toolCall);

    if (envelope.ok || !envelope.error.retryable || attempt >= MAX_TOOL_RETRIES) {
      return { envelope, retries: attempt };
    }

    logger.warn({
      event: "tool_call_retry",
      requestId,
      tool: envelope.tool,
      attempt: attempt + 1,
      code: envelope.error.code,
      message: envelope.error.message
    });

    await sleep(RETRY_DELAY_MS * (attempt + 1));
  }

  throw new Error("Tool retry loop exited unexpectedly");
}

export async function handleUserMessage({
  client,
  logger,
  model,
  history,
  userInput,
  requestId,
  contextNote,
  tools,
  executeToolCall,
  onToolResult
}: HandleUserMessageParams): Promise<AgentTurnResult> {
  const startedAt = Date.now();
  const stats = createTurnStats();

  logger.info({ event: "turn_started", requestId, inputLength: userInput.length });
  history.push({ role: "user", content: userInput });

  const modelMessages = (): Message[] => buildModelMessages(history, contextNote);

  try {
    let chatResult = await chatWithRetry(client, logger, requestId, model, modelMessages(), tools);
    trackModelAttempt(stats, chatResult);
    let response = chatResult.response;

    for (let step = 0; step < MAX_TOOL_LOOP_STEPS; step += 1) {
      const toolCallBatch = response.message.tool_calls ?? [];

      if (toolCallBatch.length === 0) {
        const assistantText = appendAssistantReply(history, response.message);
        return buildSuccessTurnResult(logger, requestId, startedAt, stats, assistantText);
      }

      history.push(response.message);

      for (const toolCall of toolCallBatch) {
        const toolAttempt = await executeToolCallWithRetry(executeToolCall, logger, requestId, toolCall);
        trackToolAttempt(stats, toolAttempt);
        appendToolResultMessage(history, toolCall, toolAttempt.envelope);

        if (onToolResult) {
          await onToolResult(toolCall, toolAttempt.envelope);
        }
      }

      chatResult = await chatWithRetry(client, logger, requestId, model, modelMessages(), tools);
      trackModelAttempt(stats, chatResult);
      response = chatResult.response;
    }

    const fallbackChat = await chatWithRetry(client, logger, requestId, model, modelMessages());
    trackModelAttempt(stats, fallbackChat);
    const fallbackText = appendAssistantReply(history, fallbackChat.response.message);
    return buildSuccessTurnResult(logger, requestId, startedAt, stats, fallbackText);
  } catch (error) {
    return buildErrorTurnResult(logger, requestId, startedAt, stats, error);
  }
}
