import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { latestFailedTasks, readTaskHistory } from "../src/history.js";

let tempDir: string | undefined;

describe("task history", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("returns latest failed or manual task keys", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "litvm-history-"));
    await writeFile(
      path.join(tempDir, "transactions.jsonl"),
      [
        JSON.stringify({
          task: "gm",
          walletIndex: 0,
          address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          status: "failed",
          timestamp: "2026-01-01T00:00:00.000Z"
        }),
        JSON.stringify({
          task: "gm",
          walletIndex: 0,
          address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          status: "success",
          timestamp: "2026-01-01T00:01:00.000Z"
        }),
        JSON.stringify({
          task: "sweep",
          walletIndex: 1,
          address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          status: "manual",
          error: "needs UI",
          timestamp: "2026-01-01T00:02:00.000Z"
        })
      ].join("\n"),
      "utf8"
    );

    const records = await readTaskHistory(tempDir);
    expect(latestFailedTasks(records)).toEqual([
      {
        walletIndex: 1,
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        task: "sweep",
        error: "needs UI"
      }
    ]);
  });
});
