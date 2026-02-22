import { execaCommand } from "execa";
import type { Tool, ToolCall } from "ollama";
import { z } from "zod";
import { DEFAULT_MAX_TEXT_CHARS, getErrorMessage, truncateText } from "./common.js";

export const RUN_COMMAND_TOOL_NAME = "run_command";

const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;
const MAX_COMMAND_TIMEOUT_MS = 20_000;

const runCommandInputSchema = z.object({
  command: z.string().trim().min(1, "command is required"),
  timeoutMs: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(MAX_COMMAND_TIMEOUT_MS)
    .optional()
});

type RunCommandInput = z.infer<typeof runCommandInputSchema>;

export type RunCommandResult = {
  ok: boolean;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  truncated: boolean;
  error?: string;
};

type RunCommandResultBase = Omit<RunCommandResult, "ok" | "error">;

type BuildRunCommandResultInput = {
  ok: boolean;
  error?: string;
} & Partial<RunCommandResultBase>;

const defaultRunCommandResultBase: RunCommandResultBase = {
  command: "",
  exitCode: null,
  stdout: "",
  stderr: "",
  timedOut: false,
  durationMs: 0,
  truncated: false
};

function buildRunCommandResult(input: BuildRunCommandResultInput): RunCommandResult {
  const { ok, error, ...baseOverrides } = input;

  return {
    ok,
    ...defaultRunCommandResultBase,
    ...baseOverrides,
    ...(error === undefined ? {} : { error })
  };
}

export const runCommandTool: Tool = {
  type: "function",
  function: {
    name: RUN_COMMAND_TOOL_NAME,
    description: "Run a shell command on the local machine and return stdout/stderr.",
    parameters: {
      type: "object",
      required: ["command"],
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute, such as `pwd` or `git status --short`."
        },
        timeoutMs: {
          type: "number",
          description: `Optional timeout in milliseconds (max ${MAX_COMMAND_TIMEOUT_MS}).`
        }
      }
    }
  }
};

function parseRunCommandInput(toolCall: ToolCall): RunCommandInput {
  const parsed = runCommandInputSchema.safeParse(toolCall.function.arguments);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid run_command arguments: ${details}`);
  }

  return parsed.data;
}

async function executeRunCommand(inputData: RunCommandInput): Promise<RunCommandResult> {
  const startedAt = Date.now();
  const timeoutMs = inputData.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  try {
    const commandResult = await execaCommand(inputData.command, {
      reject: false,
      timeout: timeoutMs,
      shell: true
    });

    const cappedStdout = truncateText(commandResult.stdout ?? "", DEFAULT_MAX_TEXT_CHARS);
    const cappedStderr = truncateText(commandResult.stderr ?? "", DEFAULT_MAX_TEXT_CHARS);

    return buildRunCommandResult({
      ok: commandResult.exitCode === 0,
      command: inputData.command,
      exitCode: commandResult.exitCode ?? null,
      stdout: cappedStdout.value,
      stderr: cappedStderr.value,
      timedOut: Boolean(commandResult.timedOut),
      durationMs: Date.now() - startedAt,
      truncated: cappedStdout.truncated || cappedStderr.truncated
    });
  } catch (error) {
    return buildRunCommandResult({
      ok: false,
      command: inputData.command,
      durationMs: Date.now() - startedAt,
      error: getErrorMessage(error)
    });
  }
}

export async function executeRunCommandToolCall(toolCall: ToolCall): Promise<RunCommandResult> {
  if (toolCall.function.name !== RUN_COMMAND_TOOL_NAME) {
    return buildRunCommandResult({
      ok: false,
      error: `Unsupported tool: ${toolCall.function.name}`
    });
  }

  try {
    const inputData = parseRunCommandInput(toolCall);
    return await executeRunCommand(inputData);
  } catch (error) {
    return buildRunCommandResult({
      ok: false,
      error: getErrorMessage(error)
    });
  }
}
