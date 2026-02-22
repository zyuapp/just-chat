import "dotenv/config";
import { stdout as output } from "node:process";
import { Ollama } from "ollama";
import { createInitialHistory } from "./agent/history.js";
import { handleUserMessage } from "./agent/loop.js";
import { getEnv } from "./config/env.js";
import { runRepl } from "./repl/repl.js";
import { executeRunCommandToolCall, runCommandTool } from "./tools/runCommand.js";

async function main(): Promise<void> {
  const env = getEnv();

  const client = new Ollama({
    host: env.OLLAMA_HOST,
    headers: {
      Authorization: `Bearer ${env.OLLAMA_API_KEY}`
    }
  });

  const history = createInitialHistory();

  await runRepl({
    onUserMessage: async (userInput) =>
      handleUserMessage({
        client,
        model: env.OLLAMA_MODEL,
        history,
        userInput,
        tools: [runCommandTool],
        executeToolCall: (toolCall) => executeRunCommandToolCall(toolCall)
      })
  });
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  output.write(`${message}\n`);
  process.exit(1);
}
