import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import type { TaskResult } from "./types.js";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info"
});

export type JsonlRecord = TaskResult & {
  timestamp: string;
};

export async function appendTaskLog(logDir: string, result: TaskResult): Promise<string> {
  await mkdir(logDir, { recursive: true });
  const filePath = path.join(logDir, "transactions.jsonl");
  const record: JsonlRecord = {
    ...result,
    timestamp: new Date().toISOString()
  };
  const handle = await open(filePath, "a");
  try {
    await handle.appendFile(`${JSON.stringify(record)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  return filePath;
}
