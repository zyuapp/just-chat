import { readFile } from "node:fs/promises";
import { LOG_FILE_PATH } from "../observability/logger.js";

type TurnCompletedLog = {
  event: "turn_completed";
  requestId: string;
  status: "success" | "error";
  durationMs: number;
  modelCalls: number;
  modelRetries: number;
  toolCalls: number;
  toolRetries: number;
  toolErrors: number;
  message?: string;
};

function parseLimit(value: string | undefined): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }

  return Math.floor(parsed);
}

function parseTurnCompletedEntries(logText: string): TurnCompletedLog[] {
  const lines = logText.split("\n").filter((line) => line.trim().length > 0);
  const entries: TurnCompletedLog[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Partial<TurnCompletedLog>;

      if (parsed.event === "turn_completed") {
        entries.push(parsed as TurnCompletedLog);
      }
    } catch {
      continue;
    }
  }

  return entries;
}

function formatEntry(entry: TurnCompletedLog): string {
  const message = entry.message ? ` msg="${entry.message}"` : "";
  return [
    `[${entry.requestId}]`,
    `status=${entry.status}`,
    `durationMs=${entry.durationMs}`,
    `modelCalls=${entry.modelCalls}`,
    `modelRetries=${entry.modelRetries}`,
    `toolCalls=${entry.toolCalls}`,
    `toolRetries=${entry.toolRetries}`,
    `toolErrors=${entry.toolErrors}${message}`
  ].join(" ");
}

async function main(): Promise<void> {
  const limit = parseLimit(process.argv[2]);

  let logText = "";
  try {
    logText = await readFile(LOG_FILE_PATH, "utf8");
  } catch {
    process.stdout.write(`No log file found at ${LOG_FILE_PATH}\n`);
    return;
  }

  const entries = parseTurnCompletedEntries(logText);
  const selected = entries.slice(-limit);

  if (selected.length === 0) {
    process.stdout.write("No completed runs found in logs yet.\n");
    return;
  }

  process.stdout.write(`Showing ${selected.length} most recent runs:\n`);
  for (const entry of selected) {
    process.stdout.write(`${formatEntry(entry)}\n`);
  }
}

await main();
