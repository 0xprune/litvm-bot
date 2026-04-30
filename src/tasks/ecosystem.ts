import type { BotConfig } from "../config.js";
import type { TaskHandler, WalletContext } from "../types.js";
import { runBrowserFlow, type BrowserAction } from "./browser.js";

function walletSuffix(wallet: WalletContext): string {
  return wallet.address.slice(2, 8).toLowerCase();
}

function tokenSymbol(wallet: WalletContext): string {
  return `LVM${wallet.index.toString(36).toUpperCase()}`.slice(0, 10);
}

function domainLabel(prefix: string, wallet: WalletContext): string {
  return `${prefix}${wallet.index}${walletSuffix(wallet)}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function createArkadaTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    const actions: BrowserAction[] = [
      { kind: "connect" },
      { kind: "click", name: "verify wallet", match: /verify wallet|verify/i },
      { kind: "click", name: "LitVM chain", match: /litvm|liteforge/i, optional: true },
      { kind: "click", name: "confirm verify", match: /verify|sign|confirm/i, optional: true }
    ];

    if (config.ARKADA_VERIFY_ARC) {
      actions.push(
        { kind: "click", name: "Arc testnet chain", match: /arc testnet|arc/i, optional: true },
        { kind: "click", name: "confirm Arc verify", match: /verify|sign|confirm/i, optional: true }
      );
    }

    return await runBrowserFlow(config, wallet, {
      task: "arkada",
      url: config.ARKADA_URL,
      description: "Arkada wallet verification",
      actions,
      expectTx: false
    });
  };
}

export function createLesterTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    const name = `${config.LESTER_TOKEN_PREFIX} ${wallet.index}`;

    return await runBrowserFlow(config, wallet, {
      task: "lester",
      url: config.LESTER_URL,
      description: "Lester ERC-20 token creation",
      actions: [
        { kind: "connect" },
        { kind: "fill", name: "token name", match: /token name|name/i, value: name, inputIndex: 0 },
        { kind: "fill", name: "token symbol", match: /token symbol|symbol/i, value: tokenSymbol(wallet), inputIndex: 1 },
        { kind: "fill", name: "token supply", match: /total supply|supply/i, value: config.LESTER_TOKEN_SUPPLY, inputIndex: 2 },
        { kind: "click", name: "next basics", match: /next/i },
        { kind: "click", name: "next features", match: /next|review/i, optional: true },
        { kind: "click", name: "deploy token", match: /deploy|create token|launch/i }
      ],
      expectTx: true
    });
  };
}

export function createMidasHandTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    return await runBrowserFlow(config, wallet, {
      task: "midashand",
      url: config.MIDASHAND_URL,
      description: "MidasHand daily claim, USDC faucet, quest, and market activity",
      actions: [
        { kind: "connect" },
        { kind: "click", name: "daily claim", match: /daily claim|claim/i, optional: true },
        { kind: "click", name: "rewards", match: /rewards|point/i, optional: true },
        { kind: "click", name: "start quest", match: /start quest|quest|daily|weekly|special/i, optional: true },
        { kind: "click", name: "USDC faucet", match: /faucet usdc|usdc faucet|faucet/i, optional: true },
        { kind: "click", name: "market", match: /market/i, optional: true },
        { kind: "click", name: "active market", match: /active|trade|buy|long|short|yes|no/i, optional: true },
        { kind: "click", name: "submit market transaction", match: /confirm|submit|trade|buy|sell/i, optional: true }
      ],
      expectTx: false
    });
  };
}

export function createZnsTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    const label = domainLabel(config.ZNS_DOMAIN_PREFIX, wallet);

    return await runBrowserFlow(config, wallet, {
      task: "zns",
      url: config.ZNS_URL,
      description: "ZNS LiteForge 7-in-1/deploy-all flow",
      actions: [
        { kind: "connect" },
        { kind: "click", name: "7-in-1", match: /7-in-1|deploy all|gm deploy/i, optional: true },
        { kind: "click", name: "LiteForge chain", match: /liteforge|litvm/i, optional: true },
        { kind: "fill", name: "domain label", match: /domain|search/i, value: label, optional: true },
        { kind: "click", name: "deploy all", match: /deploy all|run all|start|deploy/i }
      ],
      expectTx: true
    });
  };
}

export function createInfinityNameTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    const label = domainLabel(config.INFINITY_DOMAIN_PREFIX, wallet);

    return await runBrowserFlow(config, wallet, {
      task: "infinityname",
      url: config.INFINITYNAME_URL,
      description: "InfinityName LitVM testnet domain registration",
      actions: [
        { kind: "connect" },
        { kind: "fill", name: "domain search", match: /search|domain|name/i, value: label, inputIndex: 0 },
        { kind: "click", name: "search domain", match: /search|check/i, optional: true },
        { kind: "click", name: "register domain", match: /register|buy|mint|claim/i }
      ],
      expectTx: true
    });
  };
}

export function createSweepTask(config: BotConfig): TaskHandler {
  return async (wallet) => {
    return await runBrowserFlow(config, wallet, {
      task: "sweep",
      url: config.SWEEP_URL,
      description: `Sweep LitVM NFT mint flow (${config.SWEEP_MINT_COUNT} single mint(s))`,
      actions: [
        { kind: "connect" },
        { kind: "scroll", pixels: 700 },
        {
          kind: "click",
          name: "mint one NFT",
          match: /mint|claim/i,
          repeat: config.SWEEP_MINT_COUNT
        }
      ],
      expectTx: true
    });
  };
}
