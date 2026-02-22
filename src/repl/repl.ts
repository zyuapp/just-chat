import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const EXIT_COMMANDS = new Set(["exit", "quit"]);

type Repl = ReturnType<typeof createInterface>;

export type ReplTurnResult =
  | {
      kind: "success";
      text: string;
    }
  | {
      kind: "error";
      text: string;
    };

type RunReplParams = {
  onUserMessage: (userInput: string) => Promise<ReplTurnResult>;
};

function isExitCommand(userInput: string): boolean {
  return EXIT_COMMANDS.has(userInput.toLowerCase());
}

async function readUserInput(repl: Repl): Promise<string | null> {
  try {
    return (await repl.question("You: ")).trim();
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const withCode = error as Error & { code?: string };

      if (withCode.code === "ERR_USE_AFTER_CLOSE") {
        return null;
      }
    }

    throw error;
  }
}

export async function runRepl({ onUserMessage }: RunReplParams): Promise<void> {
  const repl = createInterface({ input, output });

  output.write("Local agent REPL ready. Type 'exit' to quit.\n\n");

  try {
    while (true) {
      const userInput = await readUserInput(repl);

      if (userInput === null) {
        output.write("Bye.\n");
        break;
      }

      if (userInput.length === 0) {
        continue;
      }

      if (isExitCommand(userInput)) {
        output.write("Bye.\n");
        break;
      }

      const result = await onUserMessage(userInput);
      if (result.kind === "success") {
        output.write(`Agent: ${result.text}\n\n`);
      } else {
        output.write(`Agent error: ${result.text}\n\n`);
      }
    }
  } finally {
    repl.close();
  }
}
