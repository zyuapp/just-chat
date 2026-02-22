import type { ChatResponse, Message, Tool, ToolCall } from "ollama";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { handleUserMessage, type ChatClient, type ToolExecutor } from "../../../src/agent/loop.js";
import type { ToolExecutionEnvelope } from "../../../src/tools/registry.js";

function makeToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    function: {
      name,
      arguments: args
    }
  } as ToolCall;
}

function makeChatResponse(message: Message): ChatResponse {
  return {
    model: "test-model",
    created_at: new Date(),
    message,
    done: true,
    done_reason: "stop",
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: 0,
    prompt_eval_duration: 0,
    eval_count: 0,
    eval_duration: 0
  };
}

function makeClient(chatMock: ChatClient["chat"]): ChatClient {
  return { chat: chatMock };
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn()
  } as unknown as Logger;
}

function successEnvelope(tool: string, data: unknown): ToolExecutionEnvelope {
  return {
    ok: true,
    tool,
    durationMs: 1,
    data
  };
}

function errorEnvelope(tool: string, retryable: boolean, message: string): ToolExecutionEnvelope {
  return {
    ok: false,
    tool,
    durationMs: 1,
    error: {
      code: retryable ? "TOOL_RETRYABLE_ERROR" : "TOOL_RESULT_ERROR",
      message,
      retryable
    }
  };
}

describe("handleUserMessage", () => {
  const tools: Tool[] = [
    {
      type: "function",
      function: {
        name: "run_command",
        parameters: {
          type: "object"
        }
      }
    }
  ];

  it("returns assistant text when no tool calls are needed", async () => {
    const logger = makeLogger();
    const chat = vi
      .fn<ChatClient["chat"]>()
      .mockResolvedValue(makeChatResponse({ role: "assistant", content: "hello" }));
    const executeToolCall: ToolExecutor = vi.fn();
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      logger,
      model: "test-model",
      history,
      userInput: "hi",
      requestId: "req-1",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "hello" });
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledTimes(1);
    expect(history.at(-1)).toEqual({ role: "assistant", content: "hello" });
  });

  it("executes a single tool call and returns final assistant response", async () => {
    const logger = makeLogger();
    const toolCall = makeToolCall("run_command", { command: "pwd" });
    const chat = vi
      .fn<ChatClient["chat"]>()
      .mockResolvedValueOnce(
        makeChatResponse({ role: "assistant", content: "", tool_calls: [toolCall] })
      )
      .mockResolvedValueOnce(makeChatResponse({ role: "assistant", content: "done" }));
    const executeToolCall: ToolExecutor = vi.fn().mockResolvedValue(successEnvelope("run_command", { ok: true }));
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      logger,
      model: "test-model",
      history,
      userInput: "where are we",
      requestId: "req-2",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "done" });
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall).toHaveBeenCalledWith(toolCall);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(history.some((item) => item.role === "tool")).toBe(true);
  });

  it("retries transient model errors and then succeeds", async () => {
    const logger = makeLogger();
    const chat = vi
      .fn<ChatClient["chat"]>()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(makeChatResponse({ role: "assistant", content: "after retry" }));
    const executeToolCall: ToolExecutor = vi.fn();
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      logger,
      model: "test-model",
      history,
      userInput: "retry model",
      requestId: "req-3",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "after retry" });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("retries transient tool errors and then succeeds", async () => {
    const logger = makeLogger();
    const toolCall = makeToolCall("run_command", { command: "pwd" });
    const chat = vi
      .fn<ChatClient["chat"]>()
      .mockResolvedValueOnce(
        makeChatResponse({ role: "assistant", content: "", tool_calls: [toolCall] })
      )
      .mockResolvedValueOnce(makeChatResponse({ role: "assistant", content: "tool done" }));
    const executeToolCall: ToolExecutor = vi
      .fn()
      .mockResolvedValueOnce(errorEnvelope("run_command", true, "temporary timeout"))
      .mockResolvedValueOnce(successEnvelope("run_command", { ok: true }));
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      logger,
      model: "test-model",
      history,
      userInput: "retry tool",
      requestId: "req-4",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "tool done" });
    expect(executeToolCall).toHaveBeenCalledTimes(2);
  });

  it("falls back after max tool loop steps", async () => {
    const logger = makeLogger();
    const repeatedToolCall = makeToolCall("run_command", { command: "pwd" });
    const toolResponse = makeChatResponse({
      role: "assistant",
      content: "",
      tool_calls: [repeatedToolCall]
    });

    const chat = vi
      .fn<ChatClient["chat"]>()
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(
        makeChatResponse({ role: "assistant", content: "fallback response" })
      );

    const executeToolCall: ToolExecutor = vi
      .fn()
      .mockResolvedValue(successEnvelope("run_command", { ok: true }));
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      logger,
      model: "test-model",
      history,
      userInput: "loop",
      requestId: "req-5",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "fallback response" });
    expect(executeToolCall).toHaveBeenCalledTimes(5);
    expect(chat).toHaveBeenCalledTimes(7);
  });

  it("returns error result when model call keeps failing", async () => {
    const logger = makeLogger();
    const chat = vi.fn<ChatClient["chat"]>().mockRejectedValue(new Error("network failure"));
    const executeToolCall: ToolExecutor = vi.fn();
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      logger,
      model: "test-model",
      history,
      userInput: "hello",
      requestId: "req-6",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "error", text: "network failure" });
  });
});
