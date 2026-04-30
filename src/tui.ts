import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import { formatEther } from "viem";
import { createLitvmPublicClient } from "./client.js";
import type { BotConfig } from "./config.js";
import { LITVM_CHAIN_ID } from "./constants.js";
import { createLiveDashboard } from "./dashboard.js";
import { updateEnvFile } from "./env-file.js";
import { walletHealthRows } from "./health.js";
import { latestFailedTasks, readTaskHistory } from "./history.js";
import { RUN_PROFILES } from "./profiles.js";
import { browserProxyCandidates, checkBrowserProxy } from "./proxy.js";
import { runTasks } from "./runner.js";
import { createTaskHandlers, FULL_FLOW_TASK_NAMES, TASK_NAMES } from "./tasks/index.js";
import type { TaskName } from "./types.js";
import { deriveWallets, formatWalletBackupTxt, publicWalletView, walletBackupRows } from "./wallets.js";

type MenuAction =
  | "run-profile"
  | "run-selected"
  | "run-ecosystem"
  | "resume-failed"
  | "wallet-health"
  | "config-wizard"
  | "wallets"
  | "balance"
  | "export"
  | "proxy-check"
  | "exit";

export async function runInteractiveMenu(baseConfig: BotConfig, options: { envFile?: string } = {}): Promise<void> {
  let keepGoing = true;
  let currentConfig = baseConfig;

  while (keepGoing) {
    const action = await select<MenuAction>({
      message: "LitVM bot menu",
      choices: [
        { name: "Run profile", value: "run-profile" },
        { name: "Run selected tasks", value: "run-selected" },
        { name: "Run full LitVM flow", value: "run-ecosystem" },
        { name: "Resume failed/manual tasks", value: "resume-failed" },
        { name: "Wallet health check", value: "wallet-health" },
        { name: "Config wizard", value: "config-wizard" },
        { name: "Show wallet addresses", value: "wallets" },
        { name: "Check balances", value: "balance" },
        { name: "Export wallet backup TXT", value: "export" },
        { name: "Check proxy connectivity", value: "proxy-check" },
        { name: "Exit", value: "exit" }
      ]
    });

    if (action === "exit") break;

    if (action === "run-profile") {
      const profileId = await select<string>({
        message: "Select run profile",
        choices: RUN_PROFILES.map((profile) => ({
          name: `${profile.label} (${profile.tasks.join(", ")})`,
          value: profile.id
        }))
      });
      const profile = RUN_PROFILES.find((item) => item.id === profileId);
      if (profile) await runTaskMenu(currentConfig, profile.tasks);
    }

    if (action === "run-selected") {
      const tasks = await checkbox<TaskName>({
        message: "Select tasks to run",
        required: true,
        choices: TASK_NAMES.map((task) => ({
          name: task,
          value: task,
          checked: task === "faucet" || task === "gm"
        }))
      });
      await runTaskMenu(currentConfig, tasks);
    }

    if (action === "run-ecosystem") {
      await runTaskMenu(currentConfig, FULL_FLOW_TASK_NAMES);
    }

    if (action === "resume-failed") {
      await resumeFailedMenu(currentConfig);
    }

    if (action === "wallet-health") {
      const config = await promptWalletRange(currentConfig);
      console.table(await walletHealthRows(config, deriveWallets(config)));
    }

    if (action === "config-wizard") {
      currentConfig = await configWizard(currentConfig, options.envFile ?? ".env");
    }

    if (action === "wallets") {
      const config = await promptWalletRange(currentConfig);
      console.table(publicWalletView(deriveWallets(config)));
    }

    if (action === "balance") {
      const config = await promptWalletRange(currentConfig);
      await showBalances(config);
    }

    if (action === "export") {
      const config = await promptWalletRange(currentConfig);
      await exportWalletBackup(config);
    }

    if (action === "proxy-check") {
      await runProxyCheck(currentConfig);
    }

    keepGoing = await confirm({
      message: "Back to menu?",
      default: true
    });
  }
}

async function runTaskMenu(baseConfig: BotConfig, tasks: TaskName[]): Promise<void> {
  const rangedConfig = await promptWalletRange(baseConfig);
  const concurrency = await numberInput({
    message: "How many wallets should run in parallel?",
    defaultValue: Math.min(rangedConfig.CONCURRENCY, rangedConfig.WALLET_COUNT),
    min: 1,
    max: rangedConfig.WALLET_COUNT
  });
  const browserConcurrency = await numberInput({
    message: "Max browser sessions at once",
    defaultValue: Math.min(rangedConfig.BROWSER_CONCURRENCY, concurrency),
    min: 1,
    max: concurrency
  });
  const dryRun = await confirm({
    message: "Dry-run only? No transactions will be broadcast.",
    default: true
  });
  const config = { ...rangedConfig, CONCURRENCY: concurrency, BROWSER_CONCURRENCY: browserConcurrency, dryRun };
  const dashboard = await confirm({
    message: "Show live dashboard and write JSON status file?",
    default: true
  });

  console.log(
    `Running ${tasks.join(", ")} for ${config.WALLET_COUNT} wallet(s) starting at index ${config.WALLET_START_INDEX} with wallet concurrency ${config.CONCURRENCY} and browser concurrency ${config.BROWSER_CONCURRENCY}.`
  );
  await runWithDashboardOption(config, tasks, dashboard);
}

async function resumeFailedMenu(baseConfig: BotConfig): Promise<void> {
  const failed = latestFailedTasks(await readTaskHistory(baseConfig.LOG_DIR));

  if (failed.length === 0) {
    console.log("No failed/manual tasks found in log history.");
    return;
  }

  const selected = await checkbox<string>({
    message: "Select failed/manual entries to retry",
    required: true,
    choices: failed.map((entry) => ({
      name: `wallet ${entry.walletIndex} ${entry.task}${entry.error ? ` - ${entry.error.slice(0, 80)}` : ""}`,
      value: `${entry.walletIndex}:${entry.task}`,
      checked: true
    }))
  });
  const dryRun = await confirm({
    message: "Dry-run retry only? No transactions will be broadcast.",
    default: true
  });
  const dashboard = await confirm({
    message: "Show live dashboard and write JSON status file?",
    default: true
  });
  const grouped = new Map<number, TaskName[]>();

  for (const value of selected) {
    const [walletIndexRaw, taskRaw] = value.split(":");
    const walletIndex = Number.parseInt(walletIndexRaw!, 10);
    const task = taskRaw as TaskName;
    grouped.set(walletIndex, [...(grouped.get(walletIndex) ?? []), task]);
  }

  for (const [walletIndex, tasks] of grouped) {
    const config = {
      ...baseConfig,
      dryRun,
      WALLET_START_INDEX: walletIndex,
      WALLET_COUNT: 1
    };
    await runWithDashboardOption(config, tasks, dashboard);
  }
}

async function runWithDashboardOption(config: BotConfig, tasks: TaskName[], dashboardEnabled: boolean): Promise<void> {
  const wallets = deriveWallets(config);
  const dashboard = dashboardEnabled
    ? await createLiveDashboard({
        config,
        wallets,
        tasks,
        render: true
      })
    : undefined;

  await dashboard?.start();
  await runTasks({
    wallets,
    tasks,
    handlers: createTaskHandlers(config),
    config,
    onEvent: dashboard ? (event) => dashboard.handleEvent(event) : undefined,
    silent: Boolean(dashboard)
  });
}

async function promptWalletRange(config: BotConfig): Promise<BotConfig> {
  const startIndex = await numberInput({
    message: "Start wallet index",
    defaultValue: config.WALLET_START_INDEX,
    min: 0
  });
  const count = await numberInput({
    message: "How many wallets?",
    defaultValue: config.WALLET_COUNT,
    min: 1
  });

  return {
    ...config,
    WALLET_START_INDEX: startIndex,
    WALLET_COUNT: count
  };
}

async function numberInput(options: { message: string; defaultValue: number; min: number; max?: number }): Promise<number> {
  const value = await input({
    message: options.message,
    default: String(options.defaultValue),
    validate: (raw) => {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isInteger(parsed) || parsed < options.min) {
        return `Enter an integer >= ${options.min}`;
      }
      if (options.max !== undefined && parsed > options.max) {
        return `Enter an integer <= ${options.max}`;
      }
      return true;
    }
  });

  return Number.parseInt(value, 10);
}

async function configWizard(config: BotConfig, envFile: string): Promise<BotConfig> {
  console.log(`Config wizard will update ${envFile}.`);
  const updateMnemonic = await confirm({
    message: "Update mnemonic?",
    default: !config.MNEMONIC
  });
  const mnemonic = updateMnemonic
    ? await password({
        message: "Mnemonic",
        mask: "*",
        validate: (value) => (value.trim().split(/\s+/).length >= 12 ? true : "Enter a 12+ word mnemonic")
      })
    : config.MNEMONIC;
  const startIndex = await numberInput({
    message: "Default start wallet index",
    defaultValue: config.WALLET_START_INDEX,
    min: 0
  });
  const count = await numberInput({
    message: "Default wallet count",
    defaultValue: config.WALLET_COUNT,
    min: 1
  });
  const concurrency = await numberInput({
    message: "Concurrency",
    defaultValue: config.CONCURRENCY,
    min: 1
  });
  const browserConcurrency = await numberInput({
    message: "Browser concurrency",
    defaultValue: config.BROWSER_CONCURRENCY,
    min: 1
  });
  const delayMin = await numberInput({
    message: "Delay min ms",
    defaultValue: config.DELAY_MIN_MS,
    min: 0
  });
  const delayMax = await numberInput({
    message: "Delay max ms",
    defaultValue: Math.max(config.DELAY_MAX_MS, delayMin),
    min: delayMin
  });
  const rpc = await input({
    message: "LitVM RPC URL",
    default: config.LITVM_RPC,
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return "Enter a valid URL";
      }
    }
  });
  const faucetWaitTimeout = await numberInput({
    message: "Faucet balance wait timeout ms",
    defaultValue: config.FAUCET_WAIT_TIMEOUT_MS,
    min: 10_000
  });
  const faucetPollInterval = await numberInput({
    message: "Faucet balance poll interval ms",
    defaultValue: Math.min(config.FAUCET_POLL_INTERVAL_MS, faucetWaitTimeout),
    min: 1_000,
    max: faucetWaitTimeout
  });
  const proxyServer = await input({
    message: "Browser proxy server (blank for none)",
    default: config.BROWSER_PROXY_SERVER ?? ""
  });
  const proxyPool = await input({
    message: "Browser proxy pool backups, comma-separated (blank for none)",
    default: config.BROWSER_PROXY_POOL ?? ""
  });
  const proxyMode: BotConfig["BROWSER_PROXY_MODE"] = "sticky-wallet";
  console.log("Proxy mode: sticky-wallet");
  const proxyRequireUnique = await confirm({
    message: "Require enough proxy entries for unique wallet assignment?",
    default: config.BROWSER_PROXY_REQUIRE_UNIQUE
  });
  const dashboardResolveProxyIp = await confirm({
    message: "Resolve proxy exit IPs in dashboard startup? This launches extra browsers.",
    default: config.DASHBOARD_RESOLVE_PROXY_IP
  });
  const sweepCount = await numberInput({
    message: "Sweep mint count per wallet",
    defaultValue: config.SWEEP_MINT_COUNT,
    min: 1,
    max: 20
  });
  const dashboardHost = await input({
    message: "Web dashboard host",
    default: config.DASHBOARD_HOST
  });
  const dashboardPort = await numberInput({
    message: "Web dashboard port",
    defaultValue: config.DASHBOARD_PORT,
    min: 1,
    max: 65_535
  });

  const updated: BotConfig = {
    ...config,
    MNEMONIC: mnemonic,
    WALLET_START_INDEX: startIndex,
    WALLET_COUNT: count,
    CONCURRENCY: concurrency,
    BROWSER_CONCURRENCY: browserConcurrency,
    DELAY_MIN_MS: delayMin,
    DELAY_MAX_MS: delayMax,
    LITVM_RPC: rpc,
    FAUCET_WAIT_TIMEOUT_MS: faucetWaitTimeout,
    FAUCET_POLL_INTERVAL_MS: faucetPollInterval,
    BROWSER_PROXY_MODE: proxyMode,
    BROWSER_PROXY_REQUIRE_UNIQUE: proxyRequireUnique,
    DASHBOARD_RESOLVE_PROXY_IP: dashboardResolveProxyIp,
    BROWSER_PROXY_SERVER: proxyServer.trim() || undefined,
    BROWSER_PROXY_POOL: proxyPool.trim() || undefined,
    SWEEP_MINT_COUNT: sweepCount,
    DASHBOARD_HOST: dashboardHost,
    DASHBOARD_PORT: dashboardPort
  };

  const writeChanges = await confirm({
    message: `Write these settings to ${envFile}?`,
    default: true
  });

  if (writeChanges) {
    await updateEnvFile(envFile, {
      MNEMONIC: updated.MNEMONIC,
      LITVM_RPC: updated.LITVM_RPC,
      CHAIN_ID: updated.CHAIN_ID,
      WALLET_START_INDEX: updated.WALLET_START_INDEX,
      WALLET_COUNT: updated.WALLET_COUNT,
      CONCURRENCY: updated.CONCURRENCY,
      BROWSER_CONCURRENCY: updated.BROWSER_CONCURRENCY,
      DELAY_MIN_MS: updated.DELAY_MIN_MS,
      DELAY_MAX_MS: updated.DELAY_MAX_MS,
      FAUCET_WAIT_TIMEOUT_MS: updated.FAUCET_WAIT_TIMEOUT_MS,
      FAUCET_POLL_INTERVAL_MS: updated.FAUCET_POLL_INTERVAL_MS,
      BROWSER_PROXY_MODE: updated.BROWSER_PROXY_MODE,
      BROWSER_PROXY_REQUIRE_UNIQUE: updated.BROWSER_PROXY_REQUIRE_UNIQUE,
      DASHBOARD_RESOLVE_PROXY_IP: updated.DASHBOARD_RESOLVE_PROXY_IP,
      BROWSER_PROXY_SERVER: updated.BROWSER_PROXY_SERVER,
      BROWSER_PROXY_POOL: updated.BROWSER_PROXY_POOL,
      SWEEP_MINT_COUNT: updated.SWEEP_MINT_COUNT,
      DASHBOARD_HOST: updated.DASHBOARD_HOST,
      DASHBOARD_PORT: updated.DASHBOARD_PORT
    });
    console.log(`Updated ${envFile}`);
  }

  return updated;
}

async function showBalances(config: BotConfig): Promise<void> {
  const publicClient = createLitvmPublicClient(config);
  const chainId = await publicClient.getChainId();
  if (chainId !== LITVM_CHAIN_ID) {
    throw new Error(`RPC returned chain id ${chainId}, expected ${LITVM_CHAIN_ID}`);
  }

  const rows = await Promise.all(
    deriveWallets(config).map(async (wallet) => ({
      index: wallet.index,
      address: wallet.address,
      zkLTC: formatEther(await publicClient.getBalance({ address: wallet.address }))
    }))
  );
  console.table(rows);
}

async function exportWalletBackup(config: BotConfig): Promise<void> {
  const defaultPath = path.join("exports", `wallets-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  const outputPath = await input({
    message: "Output TXT path",
    default: defaultPath,
    validate: (value) => (value.trim() ? true : "Output path is required")
  });
  const acknowledged = await confirm({
    message: "This writes plaintext private keys. Continue?",
    default: false
  });

  if (!acknowledged) {
    console.log("Export cancelled.");
    return;
  }

  const rows = walletBackupRows(deriveWallets(config));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, formatWalletBackupTxt(rows), { encoding: "utf8", mode: 0o600 });
  console.log(`Exported ${rows.length} wallet(s) to ${outputPath}`);
}

async function runProxyCheck(config: BotConfig): Promise<void> {
  const url = await input({
    message: "Proxy check URL",
    default: "https://api.ipify.org/?format=json",
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return "Enter a valid URL";
      }
    }
  });

  const results = [];
  for (const proxy of browserProxyCandidates(config)) {
    results.push(
      await checkBrowserProxy(proxy, {
        url,
        timeoutMs: config.BROWSER_TIMEOUT_MS,
        headless: config.BROWSER_HEADLESS
      })
    );
  }
  console.table(results);
}
