import { createPublicClient, createWalletClient, http, type HDAccount } from "viem";
import type { BotConfig } from "./config.js";
import { litvmLiteForge } from "./constants.js";

export function createLitvmPublicClient(config: Pick<BotConfig, "LITVM_RPC">) {
  return createPublicClient({
    chain: {
      ...litvmLiteForge,
      rpcUrls: {
        default: { http: [config.LITVM_RPC] },
        public: { http: [config.LITVM_RPC] }
      }
    },
    transport: http(config.LITVM_RPC)
  });
}

export function createLitvmWalletClient(
  config: Pick<BotConfig, "LITVM_RPC">,
  account: HDAccount
) {
  return createWalletClient({
    account,
    chain: {
      ...litvmLiteForge,
      rpcUrls: {
        default: { http: [config.LITVM_RPC] },
        public: { http: [config.LITVM_RPC] }
      }
    },
    transport: http(config.LITVM_RPC)
  });
}
