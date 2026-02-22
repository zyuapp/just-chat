import { promises as fs } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ToolCall } from "ollama";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../../../src/memory/store.js";
import type { ToolExecutionEnvelope } from "../../../src/tools/registry.js";

const testDbPath = path.join(process.cwd(), "sandbox", "test-temp", "memory-store.test.db");

function makeToolCall(): ToolCall {
  return {
    function: {
      name: "run_command",
      arguments: { command: "pwd" }
    }
  } as ToolCall;
}

function makeToolEnvelope(): ToolExecutionEnvelope {
  return {
    ok: true,
    tool: "run_command",
    durationMs: 5,
    data: { ok: true, stdout: "/tmp" }
  };
}

afterEach(async () => {
  await fs.rm(path.dirname(testDbPath), { recursive: true, force: true });
});

describe("createMemoryStore", () => {
  it("creates and reuses the same conversation id", () => {
    const store = createMemoryStore({ dbPath: testDbPath, now: () => 1 });
    const firstId = store.getOrCreateConversation("repl", "default");
    const secondId = store.getOrCreateConversation("repl", "default");

    expect(firstId).toBe(secondId);
    store.close();
  });

  it("persists and reloads recent messages", () => {
    const store = createMemoryStore({ dbPath: testDbPath, now: () => 2 });
    const conversationId = store.getOrCreateConversation("repl", "default");

    store.saveMessage({ conversationId, requestId: "req-1", role: "user", content: "hello" });
    store.saveMessage({ conversationId, requestId: "req-1", role: "assistant", content: "hi" });
    store.saveMessage({
      conversationId,
      requestId: "req-1",
      role: "tool",
      toolName: "run_command",
      content: "{\"ok\":true}"
    });

    const messages = store.listRecentMessages(conversationId, 10);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "user", content: "hello" });
    expect(messages[2]).toEqual({ role: "tool", tool_name: "run_command", content: "{\"ok\":true}" });
    store.close();
  });

  it("stores tool runs and agent runs", () => {
    const store = createMemoryStore({ dbPath: testDbPath, now: () => 3 });
    const conversationId = store.getOrCreateConversation("repl", "default");

    store.saveToolRun({
      conversationId,
      requestId: "req-2",
      toolCall: makeToolCall(),
      envelope: makeToolEnvelope()
    });

    store.saveAgentRun({
      conversationId,
      requestId: "req-2",
      status: "success",
      durationMs: 20,
      modelCalls: 2,
      modelRetries: 1,
      toolCalls: 1,
      toolRetries: 0,
      toolErrors: 0
    });
    store.close();

    const sqlite = new Database(testDbPath, { readonly: true });
    const toolRuns = sqlite.prepare("SELECT COUNT(*) AS count FROM tool_runs").get() as { count: number };
    const agentRuns = sqlite.prepare("SELECT COUNT(*) AS count FROM agent_runs").get() as { count: number };
    sqlite.close();

    expect(toolRuns.count).toBe(1);
    expect(agentRuns.count).toBe(1);
  });

  it("persists and reads settings", () => {
    const store = createMemoryStore({ dbPath: testDbPath, now: () => 4 });
    store.setSetting("memory.window", { limit: 50 });

    const value = store.getSetting("memory.window") as { limit: number };
    expect(value.limit).toBe(50);
    store.close();
  });
});
