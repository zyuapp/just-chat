import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Ollama, type Message } from "ollama";
import { z } from "zod";

const envSchema = z.object({
  OLLAMA_API_KEY: z.string().min(1, "OLLAMA_API_KEY is required"),
  OLLAMA_MODEL: z.string().min(1, "OLLAMA_MODEL is required"),
  OLLAMA_HOST: z.string().url("OLLAMA_HOST must be a valid URL")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `- ${issue.message}`)
    .join("\n");

  output.write("Missing or invalid environment variables:\n");
  output.write(`${details}\n\n`);
  output.write("Copy .env.example to .env and update values.\n");
  process.exit(1);
}

const env = parsedEnv.data;

const client = new Ollama({
  host: env.OLLAMA_HOST,
  headers: {
    Authorization: `Bearer ${env.OLLAMA_API_KEY}`
  }
});

const history: Message[] = [
  {
    role: "system",
    content:
      "You are a concise local coding assistant. Keep answers practical and direct."
  }
];

const repl = createInterface({ input, output });

output.write("Local agent REPL ready. Type 'exit' to quit.\n\n");

while (true) {
  const userInput = (await repl.question("You: ")).trim();

  if (userInput.length === 0) {
    continue;
  }

  if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
    output.write("Bye.\n");
    repl.close();
    process.exit(0);
  }

  history.push({ role: "user", content: userInput });

  try {
    const response = await client.chat({
      model: env.OLLAMA_MODEL,
      messages: history,
      stream: false
    });

    const assistantText = response.message.content.trim();
    history.push({ role: "assistant", content: assistantText });
    output.write(`Agent: ${assistantText}\n\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    output.write(`Agent error: ${message}\n\n`);
  }
}
