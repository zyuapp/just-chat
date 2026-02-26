import { stdout as output } from "node:process";
import { createFactsStore } from "../memory/facts-store.js";
import { createMemoryStore } from "../memory/store.js";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();

  if (query.length === 0) {
    output.write("Usage: npm run debug:facts -- <query text>\n");
    return;
  }

  const factsStore = createFactsStore();
  const memory = createMemoryStore();

  try {
    const conversationId = memory.getOrCreateConversation("repl", "default");
    const relevant = factsStore.getRelevantFacts(conversationId, query, 10);
    const formatted = factsStore.formatFactsContext(relevant);

    if (!formatted) {
      output.write("No durable facts found for this query.\n");
      return;
    }

    output.write(`${formatted}\n`);
  } finally {
    factsStore.close();
    memory.close();
  }
}

await main();
