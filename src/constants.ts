import type { Chain } from "viem";

export const LITVM_CHAIN_ID = 4441;
export const LITVM_RPC_URL = "https://liteforge.rpc.caldera.xyz/http";
export const LITVM_EXPLORER_URL = "https://liteforge.explorer.caldera.xyz";
export const LITVM_TESTNET_URL = "https://testnet.litvm.com/";
export const ONCHAINGM_URL = "https://onchaingm.com/";

export const litvmLiteForge = {
  id: LITVM_CHAIN_ID,
  name: "LitVM LiteForge",
  nativeCurrency: {
    decimals: 18,
    name: "zkLTC",
    symbol: "zkLTC"
  },
  rpcUrls: {
    default: { http: [LITVM_RPC_URL] },
    public: { http: [LITVM_RPC_URL] }
  },
  blockExplorers: {
    default: {
      name: "LiteForge Explorer",
      url: LITVM_EXPLORER_URL
    }
  },
  testnet: true
} as const satisfies Chain;

export const ONCHAINGM_ABI = [
  {
    type: "function",
    name: "timeUntilNextGM",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "onChainGM",
    stateMutability: "payable",
    inputs: [{ name: "referrer", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "onChainGMWithReferral",
    stateMutability: "payable",
    inputs: [{ name: "referrer", type: "address" }],
    outputs: []
  }
] as const;

export const ONCHAINGM_STANDARD_FEE_WEI = 29_000_000_000_000n;
export const ONCHAINGM_REFERRAL_FEE_WEI = 24_650_000_000_000n;
