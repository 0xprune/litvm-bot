import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { runTasks } from "../src/runner.js";
import type { TaskHandler, TaskName } from "../src/types.js";
import { deriveWallets } from "../src/wallets.js";

const MNEMONIC = "test test test test test test test test test test test junk";

let tempDir: string | undefined;

describe("runner", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("skips remaining wallet tasks when faucet does not fund", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "litvm-runner-"));
    const config = loadConfig({
      env: {
        MNEMONIC,
        WALLET_COUNT: "1",
        LOG_DIR: tempDir,
        DELAY_MIN_MS: "0",
        DELAY_MAX_MS: "0"
      },
      requireMnemonic: true
    });
    const [wallet] = deriveWallets(config);
    const called: TaskName[] = [];
    const handlers = {
      faucet: async (currentWallet) => {
        called.push("faucet");
        return {
          task: "faucet",
          walletIndex: currentWallet.index,
          address: currentWallet.address,
          status: "manual",
          error: "no balance"
        };
      },
      gm: async () => {
        called.push("gm");
        throw new Error("gm should not run");
      },
      "deploy-gm": async () => {
        called.push("deploy-gm");
        throw new Error("deploy-gm should not run");
      }
    } as Partial<Record<TaskName, TaskHandler>> as Record<TaskName, TaskHandler>;

    const results = await runTasks({
      wallets: [wallet!],
      tasks: ["faucet", "gm", "deploy-gm"],
      handlers,
      config,
      silent: true
    });

    expect(called).toEqual(["faucet"]);
    expect(results.map((result) => [result.task, result.status])).toEqual([
      ["faucet", "manual"],
      ["gm", "skipped"],
      ["deploy-gm", "skipped"]
    ]);
  });
});
