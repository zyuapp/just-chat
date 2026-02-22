import path from "node:path";

export const WORKSPACE_ROOT = process.cwd();
export const SANDBOX_ROOT = path.join(WORKSPACE_ROOT, "sandbox");
export const DEFAULT_MAX_TEXT_CHARS = 4_000;

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function truncateText(text: string, maxChars: number): { value: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { value: text, truncated: false };
  }

  return {
    value: `${text.slice(0, maxChars)}\n...<truncated>`,
    truncated: true
  };
}

export function resolveWorkspacePath(inputPath: string): string {
  const candidate = path.resolve(WORKSPACE_ROOT, inputPath);
  const relative = path.relative(WORKSPACE_ROOT, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside workspace scope");
  }

  return candidate;
}

export function resolveSandboxPath(inputPath: string): string {
  const candidate = path.resolve(SANDBOX_ROOT, inputPath);
  const relative = path.relative(SANDBOX_ROOT, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside sandbox scope");
  }

  return candidate;
}
