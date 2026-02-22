import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolCall } from "ollama";
import { z } from "zod";
import { getErrorMessage, resolveSandboxPath } from "./common.js";

export const WRITE_FILE_TOOL_NAME = "write_file";

const writeFileInputSchema = z.object({
  path: z.string().trim().min(1, "path is required"),
  content: z.string(),
  append: z.boolean().optional()
});

export type WriteFileResult = {
  ok: boolean;
  path: string;
  bytesWritten: number;
  append: boolean;
  error?: string;
};

export const writeFileTool: Tool = {
  type: "function",
  function: {
    name: WRITE_FILE_TOOL_NAME,
    description: "Write UTF-8 text to a file inside the sandbox directory.",
    parameters: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: {
          type: "string",
          description: "Sandbox-relative target file path."
        },
        content: {
          type: "string",
          description: "Text content to write."
        },
        append: {
          type: "boolean",
          description: "When true, append content instead of overwriting."
        }
      }
    }
  }
};

export async function executeWriteFileToolCall(toolCall: ToolCall): Promise<WriteFileResult> {
  if (toolCall.function.name !== WRITE_FILE_TOOL_NAME) {
    return {
      ok: false,
      path: "",
      bytesWritten: 0,
      append: false,
      error: `Unsupported tool: ${toolCall.function.name}`
    };
  }

  try {
    const inputData = writeFileInputSchema.parse(toolCall.function.arguments ?? {});
    const targetPath = resolveSandboxPath(inputData.path);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (inputData.append) {
      await fs.appendFile(targetPath, inputData.content, "utf8");
    } else {
      await fs.writeFile(targetPath, inputData.content, "utf8");
    }

    return {
      ok: true,
      path: path.relative(process.cwd(), targetPath),
      bytesWritten: Buffer.byteLength(inputData.content, "utf8"),
      append: Boolean(inputData.append)
    };
  } catch (error) {
    return {
      ok: false,
      path: "",
      bytesWritten: 0,
      append: false,
      error: getErrorMessage(error)
    };
  }
}
