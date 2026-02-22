import type { Tool, ToolCall } from "ollama";
import { executeGitStatusToolCall, gitStatusTool, GIT_STATUS_TOOL_NAME } from "./gitStatus.js";
import { executeLsToolCall, LS_TOOL_NAME, lsTool } from "./ls.js";
import { executePwdToolCall, PWD_TOOL_NAME, pwdTool } from "./pwd.js";
import { executeReadFileToolCall, readFileTool, READ_FILE_TOOL_NAME } from "./readFile.js";
import { executeRunCommandToolCall, runCommandTool, RUN_COMMAND_TOOL_NAME } from "./runCommand.js";
import { executeWriteFileToolCall, writeFileTool, WRITE_FILE_TOOL_NAME } from "./writeFile.js";

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

export async function executeToolCall(toolCall: ToolCall): Promise<unknown> {
  const execute = toolExecutors[toolCall.function.name];

  if (!execute) {
    return {
      ok: false,
      error: `Unsupported tool: ${toolCall.function.name}`
    };
  }

  return execute(toolCall);
}
