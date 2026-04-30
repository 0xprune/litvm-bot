import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Address } from "viem";
import type { JsonlRecord } from "./logger.js";
import type { TaskName } from "./types.js";

export type FailedTaskKey = {
  walletIndex: number;
  address: Address;
  task: TaskName;
  error?: string;
  message?: string;
};

export async function readTaskHistory(logDir: string): Promise<JsonlRecord[]> {
  const filePath = path.join(logDir, "transactions.jsonl");
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonlRecord);
}

export function latestFailedTasks(records: JsonlRecord[]): FailedTaskKey[] {
  const latest = new Map<string, JsonlRecord>();

  for (const record of records) {
    latest.set(`${record.walletIndex}:${record.task}`, record);
  }

  return [...latest.values()]
    .filter((record) => record.status === "failed" || record.status === "manual")
    .map((record) => ({
      walletIndex: record.walletIndex,
      address: record.address,
      task: record.task,
      error: record.error,
      message: record.message
    }))
    .sort((a, b) => a.walletIndex - b.walletIndex || a.task.localeCompare(b.task));
}
