import "dotenv/config";
import { stdout as output } from "node:process";
import { Ollama } from "ollama";
import { getEnv } from "../config/env.js";
import { createRagMemory } from "../memory/rag.js";
import { createMemoryStore } from "../memory/store.js";
import { logger } from "../observability/logger.js";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();

  if (query.length === 0) {
    output.write("Usage: npm run debug:memory -- <query text>\n");
    return;
  }

  const env = getEnv();
  const client = new Ollama({
    host: env.OLLAMA_HOST,
    headers: {
      Authorization: `Bearer ${env.OLLAMA_API_KEY}`
    }
  });

  const memory = createMemoryStore();
  const ragMemory = createRagMemory({
    memory,
    embedClient: client,
    logger,
    embedModel: env.OLLAMA_EMBED_MODEL
  });

  try {
    const conversationId = memory.getOrCreateConversation("repl", "default");
    const context = await ragMemory.retrieveContext(conversationId, query);

    if (!context) {
      output.write("No semantic memory hits found.\n");
      return;
    }

    output.write(`${context}\n`);
  } finally {
    memory.close();
  }
}

await main();
