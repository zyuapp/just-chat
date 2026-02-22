import { execaCommand } from "execa";
import type { Tool, ToolCall } from "ollama";
import { z } from "zod";
import { DEFAULT_MAX_TEXT_CHARS, WORKSPACE_ROOT, getErrorMessage, truncateText } from "./common.js";

export const GIT_STATUS_TOOL_NAME = "git_status";

const gitStatusInputSchema = z.object({}).passthrough();

export type GitStatusResult = {
  ok: boolean;
  output: string;
  exitCode: number | null;
  truncated: boolean;
  error?: string;
};

export const gitStatusTool: Tool = {
  type: "function",
  function: {
    name: GIT_STATUS_TOOL_NAME,
    description: "Return concise git status for the current repository.",
    parameters: {
      type: "object",
      properties: {}
    }
  }
};

export async function executeGitStatusToolCall(toolCall: ToolCall): Promise<GitStatusResult> {
  if (toolCall.function.name !== GIT_STATUS_TOOL_NAME) {
    return {
      ok: false,
      output: "",
      exitCode: null,
      truncated: false,
      error: `Unsupported tool: ${toolCall.function.name}`
    };
  }

  try {
    gitStatusInputSchema.parse(toolCall.function.arguments ?? {});

    const commandResult = await execaCommand("git status --short --branch", {
      reject: false,
      shell: true,
      cwd: WORKSPACE_ROOT
    });

    const combinedOutput = [commandResult.stdout, commandResult.stderr].filter(Boolean).join("\n");
    const cappedOutput = truncateText(combinedOutput, DEFAULT_MAX_TEXT_CHARS);

    return {
      ok: commandResult.exitCode === 0,
      output: cappedOutput.value,
      exitCode: commandResult.exitCode ?? null,
      truncated: cappedOutput.truncated
    };
  } catch (error) {
    return {
      ok: false,
      output: "",
      exitCode: null,
      truncated: false,
      error: getErrorMessage(error)
    };
  }
}
