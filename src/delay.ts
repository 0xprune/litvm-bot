import type { DelayRange } from "./types.js";

export function randomDelayMs(range: DelayRange, random = Math.random): number {
  if (range.maxMs < range.minMs) {
    throw new Error("maxMs must be greater than or equal to minMs");
  }
  if (range.minMs === range.maxMs) return range.minMs;
  return Math.floor(range.minMs + random() * (range.maxMs - range.minMs + 1));
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
