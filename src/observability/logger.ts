import { mkdirSync } from "node:fs";
import path from "node:path";
import pino from "pino";

const LOG_DIR = path.join(process.cwd(), "data", "logs");
export const LOG_FILE_PATH = path.join(LOG_DIR, "agent.log");

mkdirSync(LOG_DIR, { recursive: true });

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  },
  pino.destination({ dest: LOG_FILE_PATH, sync: false })
);
