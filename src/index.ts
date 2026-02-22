import "dotenv/config";
import { randomUUID } from "node:crypto";
import { stdout as output } from "node:process";
import { Ollama } from "ollama";
import { createInitialHistory } from "./agent/history.js";
import { handleUserMessage } from "./agent/loop.js";
import { getEnv } from "./config/env.js";
import { createMemoryStore } from "./memory/store.js";
import { logger } from "./observability/logger.js";
import { runRepl } from "./repl/repl.js";
import { allTools, executeToolCall } from "./tools/registry.js";

async function main(): Promise<void> {
  const env = getEnv();

  const client = new Ollama({
    host: env.OLLAMA_HOST,
    headers: {
      Authorization: `Bearer ${env.OLLAMA_API_KEY}`
    }
  });

  const memory = createMemoryStore();
  const conversationId = memory.getOrCreateConversation("repl", "default");
  const history = createInitialHistory();
  const persistedMessages = memory.listRecentMessages(conversationId, 40);
  history.push(...persistedMessages);

  try {
    await runRepl({
      onUserMessage: async (userInput) => {
        const requestId = randomUUID();
        memory.saveMessage({
          conversationId,
          requestId,
          role: "user",
          content: userInput
        });

        const result = await handleUserMessage({
          client,
          logger,
          model: env.OLLAMA_MODEL,
          history,
          userInput,
          requestId,
          tools: allTools,
          executeToolCall,
          onToolResult: async (toolCall, envelope) => {
            memory.saveToolRun({
              conversationId,
              requestId,
              toolCall,
              envelope
            });

            memory.saveMessage({
              conversationId,
              requestId,
              role: "tool",
              toolName: toolCall.function.name,
              content: JSON.stringify(envelope)
            });
          }
        });

        if (result.kind === "success") {
          memory.saveMessage({
            conversationId,
            requestId,
            role: "assistant",
            content: result.text
          });
        }

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

        return result;
      }
    });
  } finally {
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
