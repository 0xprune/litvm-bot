import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendTaskLog } from "../src/logger.js";

let tempDir: string | undefined;

describe("jsonl logger", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("appends task results as JSONL", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "litvm-bot-"));
    await mkdir(tempDir, { recursive: true });

    const logPath = await appendTaskLog(tempDir, {
      task: "gm",
      walletIndex: 0,
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      status: "dry-run",
      message: "ok"
    });

    const lines = (await readFile(logPath, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!);
    expect(record.task).toBe("gm");
    expect(record.walletIndex).toBe(0);
    expect(record.timestamp).toMatch(/T/);
  });
});
