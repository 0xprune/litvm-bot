import { describe, expect, it } from "vitest";
import { deriveWallets, derivationPath, formatWalletBackupTxt, publicWalletView, walletBackupRows } from "../src/wallets.js";

const MNEMONIC = "test test test test test test test test test test test junk";

describe("wallet derivation", () => {
  it("uses the expected EVM derivation path", () => {
    expect(derivationPath(7)).toBe("m/44'/60'/0'/0/7");
  });

  it("derives deterministic addresses without exposing private keys in public view", () => {
    const wallets = deriveWallets({
      MNEMONIC,
      WALLET_START_INDEX: 0,
      WALLET_COUNT: 2
    });

    expect(wallets[0]?.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(wallets[1]?.path).toBe("m/44'/60'/0'/0/1");
    expect(publicWalletView(wallets)[0]).toEqual({
      index: 0,
      path: "m/44'/60'/0'/0/0",
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    });
    expect(JSON.stringify(publicWalletView(wallets))).not.toContain("privateKey");
  });

  it("formats backup rows as address pipe private key", () => {
    const wallets = deriveWallets({
      MNEMONIC,
      WALLET_START_INDEX: 0,
      WALLET_COUNT: 1
    });
    const [row] = walletBackupRows(wallets);

    expect(row?.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(formatWalletBackupTxt([row!])).toBe(
      `address | privateKey\n${row!.address} | ${row!.privateKey}\n`
    );
  });
});
