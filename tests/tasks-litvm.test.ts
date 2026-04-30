import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createTaskHandlers } from "../src/tasks/index.js";
import { deriveWallets } from "../src/wallets.js";

const MNEMONIC = "test test test test test test test test test test test junk";

describe("LitVM task dry-runs", () => {
  it("returns manual-safe faucet handoff in dry-run mode", async () => {
    const config = loadConfig({
      env: { MNEMONIC, WALLET_COUNT: "1" },
      requireMnemonic: true,
      dryRun: true
    });
    const [wallet] = deriveWallets(config);
    const result = await createTaskHandlers(config).faucet(wallet!);

    expect(result.status).toBe("dry-run");
    expect(result.message).toContain("Get zkLTC Testnet Tokens");
  });

  it("falls back when OnChainGM contract address is not configured", async () => {
    const config = loadConfig({
      env: { MNEMONIC, WALLET_COUNT: "1" },
      requireMnemonic: true,
      dryRun: true
    });
    const [wallet] = deriveWallets(config);
    const result = await createTaskHandlers(config).gm(wallet!);

    expect(result.status).toBe("dry-run");
    expect(result.message).toContain("contract address is not configured");
  });

  it("dry-runs an ecosystem browser module without launching a browser", async () => {
    const config = loadConfig({
      env: { MNEMONIC, WALLET_COUNT: "1" },
      requireMnemonic: true,
      dryRun: true
    });
    const [wallet] = deriveWallets(config);
    const result = await createTaskHandlers(config).sweep(wallet!);

    expect(result.status).toBe("dry-run");
    expect(result.message).toContain("Sweep");
  });
});
