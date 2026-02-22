import type { Tool, ToolCall } from "ollama";
import { z } from "zod";
import { WORKSPACE_ROOT, getErrorMessage } from "./common.js";

export const PWD_TOOL_NAME = "pwd";

const pwdInputSchema = z.object({}).passthrough();

export type PwdResult = {
  ok: boolean;
  cwd: string;
  error?: string;
};

export const pwdTool: Tool = {
  type: "function",
  function: {
    name: PWD_TOOL_NAME,
    description: "Return the current working directory for this agent.",
    parameters: {
      type: "object",
      properties: {}
    }
  }
};

export async function executePwdToolCall(toolCall: ToolCall): Promise<PwdResult> {
  if (toolCall.function.name !== PWD_TOOL_NAME) {
    return {
      ok: false,
      cwd: "",
      error: `Unsupported tool: ${toolCall.function.name}`
    };
  }

  try {
    pwdInputSchema.parse(toolCall.function.arguments ?? {});
    return {
      ok: true,
      cwd: WORKSPACE_ROOT
    };
  } catch (error) {
    return {
      ok: false,
      cwd: "",
      error: getErrorMessage(error)
    };
  }
}
