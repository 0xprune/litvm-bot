import { encodeFunctionData, formatEther, isAddress, zeroAddress, type Address } from "viem";
import type { BotConfig } from "../config.js";
import { createLitvmPublicClient, createLitvmWalletClient } from "../client.js";
import { sleep } from "../delay.js";
import {
  LITVM_TESTNET_URL,
  ONCHAINGM_ABI,
  ONCHAINGM_URL,
  ONCHAINGM_REFERRAL_FEE_WEI,
  ONCHAINGM_STANDARD_FEE_WEI,
  litvmLiteForge
} from "../constants.js";
import type { TaskHandler, TaskResult, WalletContext } from "../types.js";
import { runBrowserFlow } from "./browser.js";

function baseResult(wallet: WalletContext, task: TaskResult["task"]): Pick<TaskResult, "task" | "walletIndex" | "address"> {
  return {
    task,
    walletIndex: wallet.index,
    address: wallet.address
  };
}

function normalizedReferrer(config: BotConfig, wallet: WalletContext): Address {
  if (!config.ONCHAINGM_REFERRER) return zeroAddress;
  if (config.ONCHAINGM_REFERRER.toLowerCase() === wallet.address.toLowerCase()) return zeroAddress;
  return config.ONCHAINGM_REFERRER;
}

export function createFaucetTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    const result = baseResult(wallet, "faucet");
    const message = `Would open ${LITVM_TESTNET_URL}, connect ${wallet.address}, add LitVM LiteForge, click "Get zkLTC Testnet Tokens" / 0.1 faucet, then scroll to Explore the Ecosystem.`;

    if (config.dryRun) {
      return { ...result, status: "dry-run", message };
    }

    const publicClient = createLitvmPublicClient(config);
    const startingBalance = await publicClient.getBalance({ address: wallet.address });

    if (startingBalance > 0n) {
      return {
        ...result,
        status: "skipped",
        balance: `${formatEther(startingBalance)} zkLTC`,
        message: `Wallet already has ${formatEther(startingBalance)} zkLTC; faucet skipped.`
      };
    }

    const attempt = await runBrowserFlow(config, wallet, {
      task: "faucet",
      url: LITVM_TESTNET_URL,
      description: "LitVM testnet portal connect, add-network, faucet, and ecosystem scroll flow",
      actions: [
        { kind: "connect", optional: true },
        { kind: "click", name: "add LitVM network", match: /add litvm|add network|liteforge/i, optional: true },
        {
          kind: "click",
          name: "get zkLTC testnet tokens",
          match: /get zkl?tc testnet tokens|get testnet tokens|faucet|0\.1/i
        },
        { kind: "click", name: "0.1 zkLTC faucet", match: /0\.1|claim|request|get/i, optional: true },
        { kind: "scroll", pixels: 900 },
        { kind: "click", name: "Explore the Ecosystem", match: /explore the ecosystem|ecosystem/i, optional: true }
      ],
      expectTx: false
    });

    const fundedBalance = await waitForFaucetFunding(config, wallet.address, startingBalance);

    if (fundedBalance > startingBalance && fundedBalance > 0n) {
      return {
        ...result,
        status: "success",
        proxy: attempt.proxy,
        balance: `${formatEther(fundedBalance)} zkLTC`,
        message: `Faucet funded wallet. Current balance: ${formatEther(fundedBalance)} zkLTC.`
      };
    }

    return {
      ...result,
      status: "manual",
      proxy: attempt.proxy,
      balance: `${formatEther(fundedBalance)} zkLTC`,
      message: `Faucet did not fund this wallet within ${Math.round(config.FAUCET_WAIT_TIMEOUT_MS / 1000)}s. Keep ${LITVM_TESTNET_URL} open, complete the faucet manually if it asks for verification, then rerun/resume this wallet.`,
      error: attempt.error ?? `Balance stayed at ${formatEther(fundedBalance)} zkLTC`
    };
  };
}

async function waitForFaucetFunding(config: BotConfig, address: Address, startingBalance: bigint): Promise<bigint> {
  const publicClient = createLitvmPublicClient(config);
  const deadline = Date.now() + config.FAUCET_WAIT_TIMEOUT_MS;
  let latestBalance = startingBalance;

  while (Date.now() <= deadline) {
    await sleep(config.FAUCET_POLL_INTERVAL_MS);
    latestBalance = await publicClient.getBalance({ address });
    if (latestBalance > startingBalance && latestBalance > 0n) break;
  }

  return latestBalance;
}

export function createGmTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    const result = baseResult(wallet, "gm");
    const contractAddress = config.ONCHAINGM_CONTRACT_ADDRESS;

    if (!contractAddress || !isAddress(contractAddress)) {
      return await createGmFallbackResult(config, wallet, "OnChainGM LitVM contract address is not configured.");
    }

    const publicClient = createLitvmPublicClient(config);
    const referrer = normalizedReferrer(config, wallet);
    const value = referrer === zeroAddress ? config.ONCHAINGM_STANDARD_FEE_WEI : config.ONCHAINGM_REFERRAL_FEE_WEI;

    try {
      const cooldown = await publicClient.readContract({
        address: contractAddress,
        abi: ONCHAINGM_ABI,
        functionName: "timeUntilNextGM",
        args: [wallet.address]
      });

      if (cooldown > 0n) {
        return {
          ...result,
          status: "skipped",
          message: `Wallet is still on GM cooldown for ${cooldown.toString()} seconds.`
        };
      }

      const functionName = config.ONCHAINGM_USE_REFERRAL_FUNCTION ? "onChainGMWithReferral" : "onChainGM";
      const data = encodeFunctionData({
        abi: ONCHAINGM_ABI,
        functionName,
        args: [referrer]
      });

      if (config.dryRun) {
        return {
          ...result,
          status: "dry-run",
          message: `Would call ${functionName}(${referrer}) with ${formatEther(value)} zkLTC. Data: ${data}`
        };
      }

      const walletClient = createLitvmWalletClient(config, wallet.account);
      const txHash = await walletClient.sendTransaction({
        account: wallet.account,
        chain: litvmLiteForge,
        to: contractAddress,
        value,
        data
      });

      return {
        ...result,
        status: "success",
        txHash,
        message: `GM submitted with ${formatEther(value)} zkLTC.`
      };
    } catch (error) {
      return {
        ...result,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  };
}

async function createGmFallbackResult(config: BotConfig, wallet: WalletContext, reason: string): Promise<TaskResult> {
  const result = await runBrowserFlow(config, wallet, {
    task: "gm",
    url: ONCHAINGM_URL,
    description: `OnChainGM daily GM browser fallback (${reason})`,
    actions: [
      { kind: "connect" },
      { kind: "click", name: "LitVM network", match: /litvm|liteforge/i, optional: true },
      { kind: "click", name: "daily GM", match: /send gm|say gm|\bgm\b/i }
    ],
    expectTx: true
  });

  return result;
}

export function createDeployGmTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    return await runBrowserFlow(config, wallet, {
      task: "deploy-gm",
      url: ONCHAINGM_URL,
      description: "OnChainGM deploy-contract browser flow",
      actions: [
        { kind: "connect" },
        { kind: "click", name: "deploy tab", match: /deploy|contract/i, optional: true },
        { kind: "click", name: "LitVM network", match: /litvm|liteforge/i, optional: true },
        { kind: "click", name: "deploy contract", match: /deploy contract|deploy|create/i }
      ],
      expectTx: true
    });
  };
}
