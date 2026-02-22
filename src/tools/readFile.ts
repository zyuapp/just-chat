import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolCall } from "ollama";
import { z } from "zod";
import {
  DEFAULT_MAX_TEXT_CHARS,
  getErrorMessage,
  resolveWorkspacePath,
  truncateText
} from "./common.js";

export const READ_FILE_TOOL_NAME = "read_file";

const readFileInputSchema = z.object({
  path: z.string().trim().min(1, "path is required"),
  maxChars: z.coerce.number().int().min(1).max(20_000).optional()
});

export type ReadFileResult = {
  ok: boolean;
  path: string;
  content: string;
  truncated: boolean;
  error?: string;
};

export const readFileTool: Tool = {
  type: "function",
  function: {
    name: READ_FILE_TOOL_NAME,
    description: "Read a UTF-8 text file from the workspace.",
    parameters: {
      type: "object",
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative file path to read."
        },
        maxChars: {
          type: "number",
          description: "Optional max characters to return (default 4000, max 20000)."
        }
      }
    }
  }
};

export async function executeReadFileToolCall(toolCall: ToolCall): Promise<ReadFileResult> {
  if (toolCall.function.name !== READ_FILE_TOOL_NAME) {
    return {
      ok: false,
      path: "",
      content: "",
      truncated: false,
      error: `Unsupported tool: ${toolCall.function.name}`
    };
  }

  try {
    const inputData = readFileInputSchema.parse(toolCall.function.arguments ?? {});
    const targetPath = resolveWorkspacePath(inputData.path);
    const content = await fs.readFile(targetPath, "utf8");
    const cappedContent = truncateText(content, inputData.maxChars ?? DEFAULT_MAX_TEXT_CHARS);

    return {
      ok: true,
      path: path.relative(process.cwd(), targetPath),
      content: cappedContent.value,
      truncated: cappedContent.truncated
    };
  } catch (error) {
    return {
      ok: false,
      path: "",
      content: "",
      truncated: false,
      error: getErrorMessage(error)
    };
  }
}
