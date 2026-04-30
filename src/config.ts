import { config as loadDotenv } from "dotenv";
import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import {
  LITVM_CHAIN_ID,
  LITVM_RPC_URL,
  ONCHAINGM_REFERRAL_FEE_WEI,
  ONCHAINGM_STANDARD_FEE_WEI
} from "./constants.js";

const intFromEnv = (fallback: number) =>
  z
    .union([z.string(), z.number(), z.undefined()])
    .transform((value) => {
      if (value === undefined || value === "") return fallback;
      const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
      if (!Number.isInteger(parsed)) {
        throw new Error(`Expected integer, received ${String(value)}`);
      }
      return parsed;
    });

const bigintFromEnv = (fallback: bigint) =>
  z
    .union([z.string(), z.bigint(), z.undefined()])
    .transform((value) => {
      if (value === undefined || value === "") return fallback;
      if (typeof value === "bigint") return value;
      return BigInt(value);
    });

const boolFromEnv = (fallback: boolean) =>
  z
    .union([z.string(), z.boolean(), z.undefined()])
    .transform((value) => {
      if (value === undefined || value === "") return fallback;
      return value === true || value === "true" || value === "1" || value === "yes";
    });

const optionalAddress = z
  .union([z.string(), z.undefined()])
  .transform((value) => {
    if (!value) return undefined;
    if (!isAddress(value)) {
      throw new Error(`Invalid EVM address: ${value}`);
    }
    return getAddress(value) as Address;
  });

const rawEnvSchema = z
  .object({
    MNEMONIC: z.string().optional(),
    LITVM_RPC: z.string().url().default(LITVM_RPC_URL),
    CHAIN_ID: intFromEnv(LITVM_CHAIN_ID),
    WALLET_START_INDEX: intFromEnv(0),
    WALLET_COUNT: intFromEnv(10),
    CONCURRENCY: intFromEnv(1),
    DELAY_MIN_MS: intFromEnv(45_000),
    DELAY_MAX_MS: intFromEnv(120_000),
    LOG_DIR: z.string().default("logs"),
    STATUS_FILE: z.string().default("logs/status.json"),
    DASHBOARD_HOST: z.string().default("127.0.0.1"),
    DASHBOARD_PORT: intFromEnv(8787),
    ONCHAINGM_CONTRACT_ADDRESS: optionalAddress,
    ONCHAINGM_REFERRER: optionalAddress,
    ONCHAINGM_USE_REFERRAL_FUNCTION: z
      .union([z.string(), z.boolean(), z.undefined()])
      .transform((value) => value === true || value === "true" || value === "1")
      .default(false),
    ONCHAINGM_STANDARD_FEE_WEI: bigintFromEnv(ONCHAINGM_STANDARD_FEE_WEI),
    ONCHAINGM_REFERRAL_FEE_WEI: bigintFromEnv(ONCHAINGM_REFERRAL_FEE_WEI),
    FAUCET_WAIT_TIMEOUT_MS: intFromEnv(180_000),
    FAUCET_POLL_INTERVAL_MS: intFromEnv(5_000),
    BROWSER_HEADLESS: boolFromEnv(true),
    BROWSER_CONCURRENCY: intFromEnv(3),
    BROWSER_TIMEOUT_MS: intFromEnv(60_000),
    BROWSER_PROXY_MODE: z.enum(["failover", "sticky-wallet"]).default("sticky-wallet"),
    BROWSER_PROXY_REQUIRE_UNIQUE: boolFromEnv(false),
    BROWSER_PROXY_SERVER: z.string().optional(),
    BROWSER_PROXY_POOL: z.string().optional(),
    BROWSER_PROXY_USERNAME: z.string().optional(),
    BROWSER_PROXY_PASSWORD: z.string().optional(),
    BROWSER_PROXY_DIRECT_FALLBACK: boolFromEnv(false),
    DASHBOARD_RESOLVE_PROXY_IP: boolFromEnv(false),
    ARKADA_URL: z.string().url().default("https://app.arkada.gg/?ref=VZRL1"),
    ARKADA_VERIFY_ARC: boolFromEnv(false),
    LESTER_URL: z.string().url().default("https://www.lester-labs.com/launch"),
    LESTER_TOKEN_PREFIX: z.string().default("LiteForge Bot"),
    LESTER_TOKEN_SUPPLY: z.string().default("1000000"),
    MIDASHAND_URL: z.string().url().default("https://www.midashand.xyz/referral/BZPMGF2M"),
    ZNS_URL: z.string().url().default("https://zns.bio/airdrops/liteforge"),
    ZNS_DOMAIN_PREFIX: z.string().default("liteforge"),
    INFINITYNAME_URL: z.string().url().default("https://infinityname.com/litvm"),
    INFINITY_DOMAIN_PREFIX: z.string().default("litvm"),
    SWEEP_URL: z.string().url().default("https://sweep.haus/LitVM"),
    SWEEP_MINT_COUNT: intFromEnv(1)
  })
  .superRefine((env, ctx) => {
    if (env.CHAIN_ID !== LITVM_CHAIN_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CHAIN_ID"],
        message: `LitVM LiteForge chain id must be ${LITVM_CHAIN_ID}`
      });
    }

    if (env.WALLET_START_INDEX < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WALLET_START_INDEX"],
        message: "WALLET_START_INDEX must be >= 0"
      });
    }

    if (env.WALLET_COUNT < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WALLET_COUNT"],
        message: "WALLET_COUNT must be >= 1"
      });
    }

    if (env.CONCURRENCY < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CONCURRENCY"],
        message: "CONCURRENCY must be >= 1"
      });
    }

    if (env.DELAY_MIN_MS < 0 || env.DELAY_MAX_MS < env.DELAY_MIN_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DELAY_MAX_MS"],
        message: "DELAY_MAX_MS must be >= DELAY_MIN_MS and delays must be non-negative"
      });
    }

    if (env.BROWSER_TIMEOUT_MS < 5_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BROWSER_TIMEOUT_MS"],
        message: "BROWSER_TIMEOUT_MS must be >= 5000"
      });
    }

    if (env.BROWSER_CONCURRENCY < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BROWSER_CONCURRENCY"],
        message: "BROWSER_CONCURRENCY must be >= 1"
      });
    }

    if (env.DASHBOARD_PORT < 1 || env.DASHBOARD_PORT > 65_535) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DASHBOARD_PORT"],
        message: "DASHBOARD_PORT must be between 1 and 65535"
      });
    }

    if (env.FAUCET_WAIT_TIMEOUT_MS < 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FAUCET_WAIT_TIMEOUT_MS"],
        message: "FAUCET_WAIT_TIMEOUT_MS must be >= 10000"
      });
    }

    if (env.FAUCET_POLL_INTERVAL_MS < 1_000 || env.FAUCET_POLL_INTERVAL_MS > env.FAUCET_WAIT_TIMEOUT_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FAUCET_POLL_INTERVAL_MS"],
        message: "FAUCET_POLL_INTERVAL_MS must be >= 1000 and <= FAUCET_WAIT_TIMEOUT_MS"
      });
    }

    if (env.SWEEP_MINT_COUNT < 1 || env.SWEEP_MINT_COUNT > 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SWEEP_MINT_COUNT"],
        message: "SWEEP_MINT_COUNT must be between 1 and 20"
      });
    }
  });

export type BotConfig = z.infer<typeof rawEnvSchema> & {
  dryRun: boolean;
};

export type LoadConfigOptions = {
  env?: NodeJS.ProcessEnv;
  envFile?: string;
  requireMnemonic?: boolean;
  dryRun?: boolean;
};

export function loadConfig(options: LoadConfigOptions = {}): BotConfig {
  if (!options.env) {
    loadDotenv(options.envFile ? { path: options.envFile } : undefined);
  }

  const parsed = rawEnvSchema.parse(options.env ?? process.env);

  if (options.requireMnemonic && !parsed.MNEMONIC) {
    throw new Error("MNEMONIC is required for wallet commands. Add it to .env.");
  }

  return {
    ...parsed,
    dryRun: options.dryRun ?? false
  };
}
