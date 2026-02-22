import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolCall } from "ollama";
import { z } from "zod";
import { getErrorMessage, resolveWorkspacePath } from "./common.js";

export const LS_TOOL_NAME = "ls";

const lsInputSchema = z.object({
  path: z.string().trim().min(1).optional()
});

export type LsResult = {
  ok: boolean;
  path: string;
  entries: string[];
  error?: string;
};

export const lsTool: Tool = {
  type: "function",
  function: {
    name: LS_TOOL_NAME,
    description: "List files and folders in a workspace directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional workspace-relative directory path. Defaults to current workspace root."
        }
      }
    }
  }
};

export async function executeLsToolCall(toolCall: ToolCall): Promise<LsResult> {
  if (toolCall.function.name !== LS_TOOL_NAME) {
    return {
      ok: false,
      path: "",
      entries: [],
      error: `Unsupported tool: ${toolCall.function.name}`
    };
  }

  try {
    const inputData = lsInputSchema.parse(toolCall.function.arguments ?? {});
    const targetPath = resolveWorkspacePath(inputData.path ?? ".");
    const directoryEntries = await fs.readdir(targetPath, { withFileTypes: true });

    const entries = directoryEntries
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .sort((a, b) => a.localeCompare(b));

    return {
      ok: true,
      path: path.relative(process.cwd(), targetPath) || ".",
      entries
    };
  } catch (error) {
    return {
      ok: false,
      path: "",
      entries: [],
      error: getErrorMessage(error)
    };
  }
}
