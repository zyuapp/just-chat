import "dotenv/config";
import { randomUUID } from "node:crypto";
import { stdout as output } from "node:process";
import { Ollama } from "ollama";
import type { AgentTurnResult } from "./agent/loop.js";
import { createInitialHistory } from "./agent/history.js";
import { handleUserMessage } from "./agent/loop.js";
import { getEnv } from "./config/env.js";
import type { AppEnv } from "./config/env.js";
import { extractFactCandidates } from "./memory/facts-extractor.js";
import { createFactsStore } from "./memory/facts-store.js";
import { createRagMemory } from "./memory/rag.js";
import type { MemoryStore } from "./memory/store.js";
import { createMemoryStore } from "./memory/store.js";
import { logger } from "./observability/logger.js";
import { runRepl } from "./repl/repl.js";
import { allTools, executeToolCall, type ToolExecutionEnvelope } from "./tools/registry.js";

function createOllamaClient(env: AppEnv): Ollama {
  return new Ollama({
    host: env.OLLAMA_HOST,
    headers: {
      Authorization: `Bearer ${env.OLLAMA_API_KEY}`
    }
  });
}

function persistToolResult(
  memory: MemoryStore,
  conversationId: string,
  requestId: string,
  toolName: string,
  envelope: ToolExecutionEnvelope
): void {
  memory.saveMessage({
    conversationId,
    requestId,
    role: "tool",
    toolName,
    content: JSON.stringify(envelope)
  });
}

async function persistAssistantResult(
  memory: MemoryStore,
  ragMemory: ReturnType<typeof createRagMemory>,
  conversationId: string,
  requestId: string,
  result: AgentTurnResult
): Promise<void> {
  if (result.kind !== "success") {
    return;
  }

  memory.saveMessage({
    conversationId,
    requestId,
    role: "assistant",
    content: result.text
  });

  await ragMemory.ingestMessage({
    conversationId,
    requestId,
    role: "assistant",
    content: result.text
  });
}

function persistRunMetrics(
  memory: MemoryStore,
  conversationId: string,
  requestId: string,
  result: AgentTurnResult
): void {
  memory.saveAgentRun({
    conversationId,
    requestId,
    status: result.kind,
    durationMs: result.meta.durationMs,
    modelCalls: result.meta.modelCalls,
    modelRetries: result.meta.modelRetries,
    toolCalls: result.meta.toolCalls,
    toolRetries: result.meta.toolRetries,
    toolErrors: result.meta.toolErrors,
    ...(result.kind === "error" ? { errorMessage: result.text } : {})
  });
}

function combineContextNotes(notes: Array<string | null>): string | undefined {
  const nonEmpty = notes.filter((note): note is string => note !== null && note.trim().length > 0);
  if (nonEmpty.length === 0) {
    return undefined;
  }

  return nonEmpty.join("\n\n");
}

function createTurnHandler(
  client: Ollama,
  memory: MemoryStore,
  factsStore: ReturnType<typeof createFactsStore>,
  ragMemory: ReturnType<typeof createRagMemory>,
  conversationId: string,
  history: ReturnType<typeof createInitialHistory>,
  model: string
) {
  return async (userInput: string): Promise<AgentTurnResult> => {
    const requestId = randomUUID();
    const factsContext = factsStore.formatFactsContext(factsStore.getRelevantFacts(conversationId, userInput));
    const ragContext = await ragMemory.retrieveContext(conversationId, userInput);

    memory.saveMessage({
      conversationId,
      requestId,
      role: "user",
      content: userInput
    });

    const factCandidates = extractFactCandidates(userInput);
    if (factCandidates.length > 0) {
      factsStore.upsertFacts(conversationId, requestId, factCandidates);
    }

    await ragMemory.ingestMessage({
      conversationId,
      requestId,
      role: "user",
      content: userInput
    });

    const result = await handleUserMessage({
      client,
      logger,
      model,
      history,
      userInput,
      requestId,
      contextNote: combineContextNotes([factsContext, ragContext]),
      tools: allTools,
      executeToolCall,
      onToolResult: async (toolCall, envelope) => {
        memory.saveToolRun({
          conversationId,
          requestId,
          toolCall,
          envelope
        });

        persistToolResult(memory, conversationId, requestId, toolCall.function.name, envelope);
      }
    });

    await persistAssistantResult(memory, ragMemory, conversationId, requestId, result);
    persistRunMetrics(memory, conversationId, requestId, result);
    return result;
  };
}

async function main(): Promise<void> {
  const env = getEnv();
  const client = createOllamaClient(env);
  const memory = createMemoryStore();
  const factsStore = createFactsStore();
  const ragMemory = createRagMemory({
    memory,
    embedClient: client,
    logger,
    embedModel: env.OLLAMA_EMBED_MODEL
  });
  const conversationId = memory.getOrCreateConversation("repl", "default");
  const history = createInitialHistory();
  history.push(...memory.listRecentMessages(conversationId, 40));

  try {
    await runRepl({
      onUserMessage: createTurnHandler(
        client,
        memory,
        factsStore,
        ragMemory,
        conversationId,
        history,
        env.OLLAMA_MODEL
      )
    });
  } finally {
    factsStore.close();
    memory.close();
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  output.write(`${message}\n`);
  process.exit(1);
}
