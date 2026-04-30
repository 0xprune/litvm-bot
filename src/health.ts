import { formatEther, parseEther } from "viem";
import { createLitvmPublicClient } from "./client.js";
import type { BotConfig } from "./config.js";
import { LITVM_CHAIN_ID } from "./constants.js";
import { readTaskHistory } from "./history.js";
import type { WalletContext } from "./types.js";

export type WalletHealthRow = {
  index: number;
  address: string;
  zkLTC: string;
  gas: "ok" | "low";
  lastStatus: string;
  lastTask: string;
};

export async function walletHealthRows(config: BotConfig, wallets: WalletContext[]): Promise<WalletHealthRow[]> {
  const publicClient = createLitvmPublicClient(config);
  const chainId = await publicClient.getChainId();
  if (chainId !== LITVM_CHAIN_ID) {
    throw new Error(`RPC returned chain id ${chainId}, expected ${LITVM_CHAIN_ID}`);
  }

  const history = await readTaskHistory(config.LOG_DIR);
  const latestByWallet = new Map<number, (typeof history)[number]>();
  for (const record of history) {
    latestByWallet.set(record.walletIndex, record);
  }

  return await Promise.all(
    wallets.map(async (wallet) => {
      const balance = await publicClient.getBalance({ address: wallet.address });
      const latest = latestByWallet.get(wallet.index);
      return {
        index: wallet.index,
        address: wallet.address,
        zkLTC: formatEther(balance),
        gas: balance >= parseEther("0.02") ? "ok" : "low",
        lastStatus: latest?.status ?? "-",
        lastTask: latest?.task ?? "-"
      };
    })
  );
}
