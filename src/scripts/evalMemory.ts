import "dotenv/config";
import { randomUUID } from "node:crypto";
import { stdout as output } from "node:process";
import { Ollama } from "ollama";
import { getEnv } from "../config/env.js";
import { createRagMemory } from "../memory/rag.js";
import { createMemoryStore } from "../memory/store.js";
import { logger } from "../observability/logger.js";

type EvalCase = {
  query: string;
  expected: string[];
};

function scoreCase(context: string | null, expected: string[]): boolean {
  if (!context) {
    return false;
  }

  const normalized = context.toLowerCase();
  return expected.every((value) => normalized.includes(value.toLowerCase()));
}

async function main(): Promise<void> {
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

  const conversationId = memory.getOrCreateConversation("eval", `phase7-${Date.now()}`);

  const preferences = [
    "I prefer npm for package management.",
    "I use vitest for tests instead of jest.",
    "I like concise, practical explanations.",
    "I usually keep my notes under sandbox/notes.",
    "I prefer TypeScript over JavaScript."
  ];

  const noiseMessages = [
    "Today I reorganized a folder.",
    "I checked git status and fixed lint issues.",
    "I experimented with tool timeouts.",
    "I tried a different prompt style.",
    "I looked at a stack trace for a network error.",
    "I updated documentation and scripts.",
    "I added a helper function for parsing.",
    "I changed a test assertion to be clearer.",
    "I cleaned up duplicated return values.",
    "I moved code into smaller modules.",
    "I validated environment variables.",
    "I tweaked retry behavior in the agent loop."
  ];

  const cases: EvalCase[] = [
    { query: "Which package manager do I prefer?", expected: ["npm"] },
    { query: "What test framework do I usually use?", expected: ["vitest"] },
    { query: "Do I prefer TypeScript or JavaScript?", expected: ["typescript"] }
  ];

  try {
    for (const message of preferences) {
      const requestId = randomUUID();
      memory.saveMessage({ conversationId, requestId, role: "user", content: message });
      await ragMemory.ingestMessage({ conversationId, requestId, role: "user", content: message });
    }

    for (const message of noiseMessages) {
      const requestId = randomUUID();
      memory.saveMessage({ conversationId, requestId, role: "assistant", content: message });
      await ragMemory.ingestMessage({ conversationId, requestId, role: "assistant", content: message });
    }

    let passCount = 0;

    for (const testCase of cases) {
      const context = await ragMemory.retrieveContext(conversationId, testCase.query);
      const passed = scoreCase(context, testCase.expected);
      if (passed) {
        passCount += 1;
      }

      output.write(`${passed ? "PASS" : "FAIL"} - ${testCase.query}\n`);
      if (context) {
        output.write(`${context}\n\n`);
      }
    }

    output.write(`Memory eval result: ${passCount}/${cases.length} passed\n`);
  } finally {
    memory.close();
  }
}

await main();
