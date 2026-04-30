import { bytesToHex, type Address, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import type { BotConfig } from "./config.js";
import type { WalletContext } from "./types.js";

export function derivationPath(index: number): `m/44'/60'/0'/0/${number}` {
  return `m/44'/60'/0'/0/${index}`;
}

export function deriveWallets(config: Pick<BotConfig, "MNEMONIC" | "WALLET_START_INDEX" | "WALLET_COUNT">): WalletContext[] {
  if (!config.MNEMONIC) {
    throw new Error("MNEMONIC is required to derive wallets.");
  }

  return Array.from({ length: config.WALLET_COUNT }, (_, offset) => {
    const index = config.WALLET_START_INDEX + offset;
    const path = derivationPath(index);
    const account = mnemonicToAccount(config.MNEMONIC!, { path });

    return {
      index,
      path,
      address: account.address as Address,
      account
    };
  });
}

export function publicWalletView(wallets: WalletContext[]) {
  return wallets.map((wallet) => ({
    index: wallet.index,
    path: wallet.path,
    address: wallet.address
  }));
}

export type WalletBackupRow = {
  index: number;
  path: string;
  address: Address;
  privateKey: Hex;
};

export function walletPrivateKey(wallet: WalletContext): Hex {
  const privateKey = wallet.account.getHdKey().privateKey;
  if (!privateKey) {
    throw new Error(`Private key is not available for wallet index ${wallet.index}.`);
  }
  return bytesToHex(privateKey);
}

export function walletBackupRows(wallets: WalletContext[]): WalletBackupRow[] {
  return wallets.map((wallet) => ({
    index: wallet.index,
    path: wallet.path,
    address: wallet.address,
    privateKey: walletPrivateKey(wallet)
  }));
}

export function formatWalletBackupTxt(rows: WalletBackupRow[]): string {
  const lines = [
    "address | privateKey",
    ...rows.map((row) => `${row.address} | ${row.privateKey}`)
  ];
  return `${lines.join("\n")}\n`;
}
