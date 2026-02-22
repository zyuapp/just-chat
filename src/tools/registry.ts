import type { Tool, ToolCall } from "ollama";
import { executeGitStatusToolCall, gitStatusTool, GIT_STATUS_TOOL_NAME } from "./gitStatus.js";
import { isTransientErrorMessage } from "./common.js";
import { executeLsToolCall, LS_TOOL_NAME, lsTool } from "./ls.js";
import { executePwdToolCall, PWD_TOOL_NAME, pwdTool } from "./pwd.js";
import { executeReadFileToolCall, readFileTool, READ_FILE_TOOL_NAME } from "./readFile.js";
import { executeRunCommandToolCall, runCommandTool, RUN_COMMAND_TOOL_NAME } from "./runCommand.js";
import { executeWriteFileToolCall, writeFileTool, WRITE_FILE_TOOL_NAME } from "./writeFile.js";

export type ToolError = {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
};

export type ToolSuccessEnvelope = {
  ok: true;
  tool: string;
  durationMs: number;
  data: unknown;
};

export type ToolErrorEnvelope = {
  ok: false;
  tool: string;
  durationMs: number;
  error: ToolError;
};

export type ToolExecutionEnvelope = ToolSuccessEnvelope | ToolErrorEnvelope;

export const allTools: Tool[] = [
  runCommandTool,
  pwdTool,
  lsTool,
  gitStatusTool,
  readFileTool,
  writeFileTool
];

type ToolExecutor = (toolCall: ToolCall) => Promise<unknown>;

const toolExecutors: Record<string, ToolExecutor> = {
  [RUN_COMMAND_TOOL_NAME]: executeRunCommandToolCall,
  [PWD_TOOL_NAME]: executePwdToolCall,
  [LS_TOOL_NAME]: executeLsToolCall,
  [GIT_STATUS_TOOL_NAME]: executeGitStatusToolCall,
  [READ_FILE_TOOL_NAME]: executeReadFileToolCall,
  [WRITE_FILE_TOOL_NAME]: executeWriteFileToolCall
};

function buildUnsupportedToolError(tool: string): ToolExecutionEnvelope {
  return {
    ok: false,
    tool,
    durationMs: 0,
    error: {
      code: "UNSUPPORTED_TOOL",
      message: `Unsupported tool: ${tool}`,
      retryable: false
    }
  };
}

function buildExecutionExceptionError(tool: string, durationMs: number, details: unknown): ToolExecutionEnvelope {
  const message = details instanceof Error ? details.message : "Unknown tool execution error";
  const retryable = isTransientErrorMessage(message);

  return {
    ok: false,
    tool,
    durationMs,
    error: {
      code: retryable ? "TOOL_TRANSIENT_ERROR" : "TOOL_EXECUTION_ERROR",
      message,
      retryable,
      details
    }
  };
}

function normalizeToolResult(tool: string, durationMs: number, data: unknown): ToolExecutionEnvelope {
  if (typeof data === "object" && data !== null && "ok" in data) {
    const maybeOk = (data as { ok?: unknown }).ok;

    if (maybeOk === false) {
      const maybeError = (data as { error?: unknown }).error;
      const message = typeof maybeError === "string" ? maybeError : "Tool reported failure";
      const retryable = isTransientErrorMessage(message);

      return {
        ok: false,
        tool,
        durationMs,
        error: {
          code: retryable ? "TOOL_RETRYABLE_ERROR" : "TOOL_RESULT_ERROR",
          message,
          retryable,
          details: data
        }
      };
    }
  }

  return {
    ok: true,
    tool,
    durationMs,
    data
  };
}

export async function executeToolCall(toolCall: ToolCall): Promise<ToolExecutionEnvelope> {
  const execute = toolExecutors[toolCall.function.name];

  if (!execute) {
    return buildUnsupportedToolError(toolCall.function.name);
  }

  const startedAt = Date.now();

  try {
    const result = await execute(toolCall);
    const durationMs = Date.now() - startedAt;
    return normalizeToolResult(toolCall.function.name, durationMs, result);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    return buildExecutionExceptionError(toolCall.function.name, durationMs, error);
  }
}
