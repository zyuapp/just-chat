import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { createRagMemory, type EmbeddingClient } from "../../../src/memory/rag.js";
import type { MemoryChunkRecord, MemoryStore } from "../../../src/memory/store.js";

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

function vectorFor(text: string): number[] {
  const normalized = text.toLowerCase();

  if (normalized.includes("npm") || normalized.includes("package manager")) {
    return [1, 0, 0];
  }

  if (normalized.includes("vitest")) {
    return [0, 1, 0];
  }

  return [0, 0, 1];
}

function makeEmbedClient(): EmbeddingClient {
  return {
    embed: vi.fn(async ({ input }) => {
      const values = Array.isArray(input) ? input : [input];
      return {
        embeddings: values.map(vectorFor)
      };
    })
  };
}

function makeMemoryStore(chunks: MemoryChunkRecord[]): MemoryStore {
  return {
    getOrCreateConversation: () => "conversation-id",
    listRecentMessages: () => [],
    saveMessage: () => undefined,
    saveToolRun: () => undefined,
    saveAgentRun: () => undefined,
    saveMemoryChunk: (input) => {
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        requestId: input.requestId,
        sourceRole: input.sourceRole,
        content: input.content,
        embedding: input.embedding,
        createdAt: Date.now()
      });
    },
    listRecentMemoryChunks: () => [...chunks],
    setSetting: () => undefined,
    getSetting: () => null,
    close: () => undefined
  };
}

describe("createRagMemory", () => {
  it("ingests message chunks with embeddings", async () => {
    const chunks: MemoryChunkRecord[] = [];
    const ragMemory = createRagMemory({
      memory: makeMemoryStore(chunks),
      embedClient: makeEmbedClient(),
      logger: makeLogger(),
      embedModel: "embed-model"
    });

    await ragMemory.ingestMessage({
      conversationId: "conversation-id",
      requestId: "req-1",
      role: "user",
      content: "I prefer npm for package management."
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].embedding).toEqual([1, 0, 0]);
  });

  it("retrieves relevant semantic context", async () => {
    const chunks: MemoryChunkRecord[] = [
      {
        id: "chunk-1",
        requestId: "req-a",
        sourceRole: "user",
        content: "I prefer npm for package management.",
        embedding: [1, 0, 0],
        createdAt: Date.now()
      },
      {
        id: "chunk-2",
        requestId: "req-b",
        sourceRole: "user",
        content: "I use vitest for tests.",
        embedding: [0, 1, 0],
        createdAt: Date.now()
      }
    ];

    const ragMemory = createRagMemory({
      memory: makeMemoryStore(chunks),
      embedClient: makeEmbedClient(),
      logger: makeLogger(),
      embedModel: "embed-model"
    });

    const context = await ragMemory.retrieveContext("conversation-id", "Which package manager do I prefer?");

    expect(context).not.toBeNull();
    expect(context).toContain("npm");
  });

  it("returns null when there are no memory hits", async () => {
    const ragMemory = createRagMemory({
      memory: makeMemoryStore([]),
      embedClient: makeEmbedClient(),
      logger: makeLogger(),
      embedModel: "embed-model"
    });

    const context = await ragMemory.retrieveContext("conversation-id", "I like npm");

    expect(context).toBeNull();
  });
});
