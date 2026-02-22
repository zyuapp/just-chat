import { promises as fs } from "node:fs";
import path from "node:path";
import type { ToolCall } from "ollama";
import { afterEach, describe, expect, it } from "vitest";
import { WORKSPACE_ROOT } from "../../../src/tools/common.js";
import { executeToolCall } from "../../../src/tools/registry.js";

const sandboxTestRoot = path.join(WORKSPACE_ROOT, "sandbox", "test-temp");

function makeToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    function: {
      name,
      arguments: args
    }
  } as ToolCall;
}

afterEach(async () => {
  await fs.rm(sandboxTestRoot, { recursive: true, force: true });
});

describe("tool registry", () => {
  it("returns success envelope for pwd", async () => {
    const result = await executeToolCall(makeToolCall("pwd", {}));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected success envelope");
    }

    expect(result.tool).toBe("pwd");
    expect((result.data as { cwd: string }).cwd).toBe(WORKSPACE_ROOT);
  });

  it("writes and reads a sandbox file", async () => {
    const writeResult = await executeToolCall(
      makeToolCall("write_file", {
        path: "test-temp/note.txt",
        content: "hello tools"
      })
    );

    expect(writeResult.ok).toBe(true);
    if (!writeResult.ok) {
      throw new Error("Expected write_file success envelope");
    }

    const writeData = writeResult.data as { path: string };
    expect(writeData.path).toBe("sandbox/test-temp/note.txt");

    const readResult = await executeToolCall(
      makeToolCall("read_file", {
        path: "sandbox/test-temp/note.txt"
      })
    );

    expect(readResult.ok).toBe(true);
    if (!readResult.ok) {
      throw new Error("Expected read_file success envelope");
    }

    const readData = readResult.data as { path: string; content: string; truncated: boolean };
    expect(readData.path).toBe("sandbox/test-temp/note.txt");
    expect(readData.content).toBe("hello tools");
    expect(readData.truncated).toBe(false);
  });

  it("returns standardized error envelope when sandbox path traversal is attempted", async () => {
    const result = await executeToolCall(
      makeToolCall("write_file", {
        path: "../outside.txt",
        content: "blocked"
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected error envelope");
    }

    expect(result.error.code).toBe("TOOL_RESULT_ERROR");
    expect(result.error.message).toContain("outside sandbox scope");
  });

  it("returns unsupported tool error envelope", async () => {
    const result = await executeToolCall(makeToolCall("nope", {}));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected error envelope");
    }

    expect(result.error.code).toBe("UNSUPPORTED_TOOL");
    expect(result.error.message).toContain("Unsupported tool");
  });

  it("lists files in sandbox directory", async () => {
    await executeToolCall(
      makeToolCall("write_file", {
        path: "test-temp/ls-check.txt",
        content: "ls"
      })
    );

    const result = await executeToolCall(
      makeToolCall("ls", {
        path: "sandbox/test-temp"
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected success envelope");
    }

    const data = result.data as { entries: string[] };
    expect(data.entries).toContain("ls-check.txt");
  });

  it("returns git status output in success envelope", async () => {
    const result = await executeToolCall(makeToolCall("git_status", {}));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected success envelope");
    }

    const data = result.data as { output: string };
    expect(typeof data.output).toBe("string");
    expect(data.output.length).toBeGreaterThan(0);
  });
});
