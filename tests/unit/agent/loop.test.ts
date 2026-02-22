import type { ChatResponse, Message, Tool, ToolCall } from "ollama";
import { describe, expect, it, vi } from "vitest";
import { handleUserMessage, type ChatClient, type ToolExecutor } from "../../../src/agent/loop.js";

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
    const chat = vi
      .fn<ChatClient["chat"]>()
      .mockResolvedValue(makeChatResponse({ role: "assistant", content: "hello" }));
    const executeToolCall: ToolExecutor = vi.fn();
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      model: "test-model",
      history,
      userInput: "hi",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "hello" });
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledTimes(1);
    expect(history.at(-1)).toEqual({ role: "assistant", content: "hello" });
  });

  it("executes a single tool call and returns final assistant response", async () => {
    const toolCall = makeToolCall("run_command", { command: "pwd" });
    const chat = vi
      .fn<ChatClient["chat"]>()
      .mockResolvedValueOnce(
        makeChatResponse({ role: "assistant", content: "", tool_calls: [toolCall] })
      )
      .mockResolvedValueOnce(makeChatResponse({ role: "assistant", content: "done" }));
    const executeToolCall: ToolExecutor = vi.fn().mockResolvedValue({ ok: true, stdout: "/tmp" });
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      model: "test-model",
      history,
      userInput: "where are we",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "done" });
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall).toHaveBeenCalledWith(toolCall);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(history.some((item) => item.role === "tool")).toBe(true);
  });

  it("executes multiple tool calls from one model response", async () => {
    const first = makeToolCall("run_command", { command: "pwd" });
    const second = makeToolCall("run_command", { command: "ls" });
    const chat = vi
      .fn<ChatClient["chat"]>()
      .mockResolvedValueOnce(
        makeChatResponse({ role: "assistant", content: "", tool_calls: [first, second] })
      )
      .mockResolvedValueOnce(makeChatResponse({ role: "assistant", content: "all done" }));
    const executeToolCall: ToolExecutor = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, stdout: "/tmp" })
      .mockResolvedValueOnce({ ok: true, stdout: "file1" });
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      model: "test-model",
      history,
      userInput: "check stuff",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "all done" });
    expect(executeToolCall).toHaveBeenCalledTimes(2);
    expect(executeToolCall).toHaveBeenNthCalledWith(1, first);
    expect(executeToolCall).toHaveBeenNthCalledWith(2, second);
  });

  it("falls back after max tool loop steps", async () => {
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

    const executeToolCall: ToolExecutor = vi.fn().mockResolvedValue({ ok: true });
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      model: "test-model",
      history,
      userInput: "loop",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "success", text: "fallback response" });
    expect(executeToolCall).toHaveBeenCalledTimes(5);
    expect(chat).toHaveBeenCalledTimes(7);
  });

  it("returns error result when model call throws", async () => {
    const chat = vi.fn<ChatClient["chat"]>().mockRejectedValue(new Error("network failure"));
    const executeToolCall: ToolExecutor = vi.fn();
    const history: Message[] = [{ role: "system", content: "system" }];

    const result = await handleUserMessage({
      client: makeClient(chat),
      model: "test-model",
      history,
      userInput: "hello",
      tools,
      executeToolCall
    });

    expect(result).toEqual({ kind: "error", text: "network failure" });
  });
});
