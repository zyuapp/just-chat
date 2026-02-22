import type { ToolCall } from "ollama";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execaCommand: vi.fn()
}));

import { execaCommand } from "execa";
import { executeRunCommandToolCall, RUN_COMMAND_TOOL_NAME } from "../../../src/tools/runCommand.js";

const mockedExecaCommand = vi.mocked(execaCommand);

function makeToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    function: {
      name,
      arguments: args
    }
  } as ToolCall;
}

describe("executeRunCommandToolCall", () => {
  beforeEach(() => {
    mockedExecaCommand.mockReset();
  });

  it("returns unsupported tool error for unknown tool names", async () => {
    const result = await executeRunCommandToolCall(makeToolCall("unknown_tool", {}));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unsupported tool");
    expect(mockedExecaCommand).not.toHaveBeenCalled();
  });

  it("returns validation error when command argument is missing", async () => {
    const result = await executeRunCommandToolCall(makeToolCall(RUN_COMMAND_TOOL_NAME, {}));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid run_command arguments");
    expect(mockedExecaCommand).not.toHaveBeenCalled();
  });

  it("executes approved command with defaults", async () => {
    mockedExecaCommand.mockResolvedValue({
      exitCode: 0,
      stdout: "/tmp",
      stderr: "",
      timedOut: false
    } as never);

    const result = await executeRunCommandToolCall(makeToolCall(RUN_COMMAND_TOOL_NAME, { command: "pwd" }));

    expect(result.ok).toBe(true);
    expect(result.command).toBe("pwd");
    expect(result.stdout).toBe("/tmp");
    expect(result.exitCode).toBe(0);
    expect(mockedExecaCommand).toHaveBeenCalledWith("pwd", {
      reject: false,
      timeout: 10_000,
      shell: true
    });
  });

  it("uses explicit timeout from tool input", async () => {
    mockedExecaCommand.mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false
    } as never);

    await executeRunCommandToolCall(makeToolCall(RUN_COMMAND_TOOL_NAME, { command: "pwd", timeoutMs: 1234 }));

    expect(mockedExecaCommand).toHaveBeenCalledWith("pwd", {
      reject: false,
      timeout: 1234,
      shell: true
    });
  });

  it("truncates oversized output", async () => {
    mockedExecaCommand.mockResolvedValue({
      exitCode: 1,
      stdout: "a".repeat(5000),
      stderr: "b".repeat(5000),
      timedOut: false
    } as never);

    const result = await executeRunCommandToolCall(
      makeToolCall(RUN_COMMAND_TOOL_NAME, { command: "very-long-output" })
    );

    expect(result.ok).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.stdout).toContain("...<truncated>");
    expect(result.stderr).toContain("...<truncated>");
  });

  it("returns execution error when execa throws", async () => {
    mockedExecaCommand.mockRejectedValue(new Error("boom"));

    const result = await executeRunCommandToolCall(makeToolCall(RUN_COMMAND_TOOL_NAME, { command: "pwd" }));

    expect(result.ok).toBe(false);
    expect(result.command).toBe("pwd");
    expect(result.error).toBe("boom");
  });
});
