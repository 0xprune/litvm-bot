import { describe, expect, it } from "vitest";
import { LITVM_CHAIN_ID, LITVM_RPC_URL } from "../src/constants.js";
import { loadConfig } from "../src/config.js";

const MNEMONIC = "test test test test test test test test test test test junk";

describe("config", () => {
  it("loads safe defaults", () => {
    const config = loadConfig({
      env: { MNEMONIC },
      requireMnemonic: true
    });

    expect(config.LITVM_RPC).toBe(LITVM_RPC_URL);
    expect(config.CHAIN_ID).toBe(LITVM_CHAIN_ID);
    expect(config.WALLET_START_INDEX).toBe(0);
    expect(config.WALLET_COUNT).toBe(10);
    expect(config.CONCURRENCY).toBe(1);
    expect(config.BROWSER_CONCURRENCY).toBe(3);
    expect(config.DELAY_MIN_MS).toBe(45_000);
    expect(config.DELAY_MAX_MS).toBe(120_000);
    expect(config.FAUCET_WAIT_TIMEOUT_MS).toBe(180_000);
    expect(config.FAUCET_POLL_INTERVAL_MS).toBe(5_000);
    expect(config.DASHBOARD_RESOLVE_PROXY_IP).toBe(false);
  });

  it("rejects non-LitVM chain ids", () => {
    expect(() =>
      loadConfig({
        env: {
          MNEMONIC,
          CHAIN_ID: "1"
        },
        requireMnemonic: true
      })
    ).toThrow(/chain id/);
  });

  it("requires mnemonic when requested", () => {
    expect(() => loadConfig({ env: {}, requireMnemonic: true })).toThrow(/MNEMONIC/);
  });

  it("rejects invalid delay ranges", () => {
    expect(() =>
      loadConfig({
        env: {
          MNEMONIC,
          DELAY_MIN_MS: "100",
          DELAY_MAX_MS: "50"
        },
        requireMnemonic: true
      })
    ).toThrow(/DELAY_MAX_MS/);
  });

  it("rejects invalid faucet wait settings", () => {
    expect(() =>
      loadConfig({
        env: {
          MNEMONIC,
          FAUCET_WAIT_TIMEOUT_MS: "10000",
          FAUCET_POLL_INTERVAL_MS: "11000"
        },
        requireMnemonic: true
      })
    ).toThrow(/FAUCET_POLL_INTERVAL_MS/);
  });

  it("rejects invalid browser concurrency", () => {
    expect(() =>
      loadConfig({
        env: {
          MNEMONIC,
          BROWSER_CONCURRENCY: "0"
        },
        requireMnemonic: true
      })
    ).toThrow(/BROWSER_CONCURRENCY/);
  });
});
