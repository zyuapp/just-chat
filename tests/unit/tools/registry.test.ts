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
  it("executes pwd tool", async () => {
    const result = await executeToolCall(makeToolCall("pwd", {}));
    const typed = result as { ok: boolean; cwd?: string };

    expect(typed.ok).toBe(true);
    expect(typed.cwd).toBe(WORKSPACE_ROOT);
  });

  it("writes and reads a sandbox file", async () => {
    const writeResult = await executeToolCall(
      makeToolCall("write_file", {
        path: "test-temp/note.txt",
        content: "hello tools"
      })
    );
    const typedWrite = writeResult as { ok: boolean; path?: string };

    expect(typedWrite.ok).toBe(true);
    expect(typedWrite.path).toBe("sandbox/test-temp/note.txt");

    const readResult = await executeToolCall(
      makeToolCall("read_file", {
        path: "sandbox/test-temp/note.txt"
      })
    );
    const typedRead = readResult as {
      ok: boolean;
      path?: string;
      content?: string;
      truncated?: boolean;
    };

    expect(typedRead.ok).toBe(true);
    expect(typedRead.path).toBe("sandbox/test-temp/note.txt");
    expect(typedRead.content).toBe("hello tools");
    expect(typedRead.truncated).toBe(false);
  });

  it("blocks write_file path traversal outside sandbox", async () => {
    const result = await executeToolCall(
      makeToolCall("write_file", {
        path: "../outside.txt",
        content: "blocked"
      })
    );
    const typed = result as { ok: boolean; error?: string };

    expect(typed.ok).toBe(false);
    expect(typed.error).toContain("outside sandbox scope");
  });

  it("returns unsupported tool error for unknown tools", async () => {
    const result = await executeToolCall(makeToolCall("nope", {}));
    const typed = result as { ok: boolean; error?: string };

    expect(typed.ok).toBe(false);
    expect(typed.error).toContain("Unsupported tool");
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
    const typed = result as { ok: boolean; entries?: string[] };

    expect(typed.ok).toBe(true);
    expect(typed.entries).toContain("ls-check.txt");
  });

  it("returns git status output", async () => {
    const result = await executeToolCall(makeToolCall("git_status", {}));
    const typed = result as { ok: boolean; output?: string };

    expect(typed.ok).toBe(true);
    expect(typeof typed.output).toBe("string");
    expect(typed.output?.length).toBeGreaterThan(0);
  });
});
