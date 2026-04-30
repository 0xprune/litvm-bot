#!/usr/bin/env node
import { Command } from "commander";
import { formatEther } from "viem";
import { loadConfig } from "./config.js";
import { createLitvmPublicClient } from "./client.js";
import { LITVM_CHAIN_ID } from "./constants.js";
import { publicWalletView, deriveWallets } from "./wallets.js";
import { createTaskHandlers, FULL_FLOW_TASK_NAMES, parseTaskList, TASK_NAMES } from "./tasks/index.js";
import { runTasks } from "./runner.js";
import { browserProxyCandidates, checkBrowserProxy } from "./proxy.js";
import { runInteractiveMenu } from "./tui.js";
import { createLiveDashboard } from "./dashboard.js";
import type { TaskName } from "./types.js";
import { startWebDashboard } from "./web-dashboard.js";

type CommonOptions = {
  envFile?: string;
  dryRun?: boolean;
  dashboard?: boolean;
  walletStartIndex?: string;
  walletCount?: string;
  concurrency?: string;
  browserConcurrency?: string;
  resolveProxyIp?: boolean;
};

function loadWalletConfig(options: CommonOptions) {
  const config = loadConfig({
    envFile: options.envFile,
    requireMnemonic: true,
    dryRun: Boolean(options.dryRun)
  });

  return applyCommonOverrides(config, options);
}

function withCommonOptions(command: Command) {
  return command
    .option("--env-file <path>", "load a specific dotenv file")
    .option("--dry-run", "derive wallets and build actions without broadcasting transactions")
    .option("--dashboard", "show live dashboard and write JSON status file")
    .option("--wallet-start-index <n>", "override WALLET_START_INDEX")
    .option("--wallet-count <n>", "override WALLET_COUNT")
    .option("--concurrency <n>", "override CONCURRENCY / wallets to run in parallel")
    .option("--browser-concurrency <n>", "override BROWSER_CONCURRENCY / Chromium sessions to run in parallel")
    .option("--resolve-proxy-ip", "resolve proxy exit IPs in dashboard startup");
}

function withEnvOption(command: Command) {
  return command.option("--env-file <path>", "load a specific dotenv file");
}

function parseIntegerOption(raw: string | undefined, name: string, min: number): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }
  return parsed;
}

function applyCommonOverrides(config: ReturnType<typeof loadConfig>, options: CommonOptions) {
  return {
    ...config,
    WALLET_START_INDEX: parseIntegerOption(options.walletStartIndex, "--wallet-start-index", 0) ?? config.WALLET_START_INDEX,
    WALLET_COUNT: parseIntegerOption(options.walletCount, "--wallet-count", 1) ?? config.WALLET_COUNT,
    CONCURRENCY: parseIntegerOption(options.concurrency, "--concurrency", 1) ?? config.CONCURRENCY,
    BROWSER_CONCURRENCY:
      parseIntegerOption(options.browserConcurrency, "--browser-concurrency", 1) ?? config.BROWSER_CONCURRENCY,
    DASHBOARD_RESOLVE_PROXY_IP: options.resolveProxyIp ?? config.DASHBOARD_RESOLVE_PROXY_IP
  };
}

async function executeTasks(config: ReturnType<typeof loadConfig>, tasks: TaskName[], dashboardEnabled?: boolean) {
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

async function main() {
  const program = new Command();

  program
    .name("bot")
    .description("LitVM LiteForge testnet automation CLI")
    .version("0.1.0")
    .action(async () => {
      const config = loadConfig({
        requireMnemonic: true
      });
      await runInteractiveMenu(config);
    });

  withCommonOptions(program.command("menu").description("open interactive TUI menu"))
    .action(async (options: CommonOptions) => {
      const config = loadWalletConfig(options);
      await runInteractiveMenu(config, { envFile: options.envFile });
    });

  withCommonOptions(program.command("wallets").description("show derived wallet addresses"))
    .action((options: CommonOptions) => {
      const config = loadWalletConfig(options);
      const wallets = deriveWallets(config);
      console.table(publicWalletView(wallets));
    });

  withCommonOptions(program.command("balance").description("check zkLTC balances for derived wallets"))
    .action(async (options: CommonOptions) => {
      const config = loadWalletConfig(options);
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
    });

  withEnvOption(
    program
      .command("web-dashboard")
      .description("serve the web dashboard for logs/status.json")
      .option("--host <host>", "host to bind")
      .option("--port <port>", "port to bind")
  ).action(async (options: CommonOptions & { host?: string; port?: string }) => {
    const config = loadConfig({
      envFile: options.envFile,
      requireMnemonic: false
    });
    const port = options.port ? Number.parseInt(options.port, 10) : config.DASHBOARD_PORT;
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error("--port must be between 1 and 65535");
    }
    const server = await startWebDashboard({
      STATUS_FILE: config.STATUS_FILE,
      DASHBOARD_HOST: options.host ?? config.DASHBOARD_HOST,
      DASHBOARD_PORT: port
    });
    console.log(`Web dashboard: ${server.url}`);
    console.log(`Reading status: ${config.STATUS_FILE}`);
    await new Promise<void>(() => undefined);
  });

  withEnvOption(
    program
      .command("proxy-check")
      .description("check configured browser proxy pool connectivity")
      .option("--url <url>", "URL to load through the browser", "https://api.ipify.org/?format=json")
      .option("--timeout-ms <ms>", "navigation timeout in milliseconds")
  ).action(async (options: CommonOptions & { url: string; timeoutMs?: string }) => {
    const config = loadConfig({
      envFile: options.envFile,
      requireMnemonic: false
    });
    const timeoutMs = options.timeoutMs ? Number.parseInt(options.timeoutMs, 10) : config.BROWSER_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
      throw new Error("--timeout-ms must be an integer >= 1000");
    }

    const results = [];
    for (const proxy of browserProxyCandidates(config)) {
      results.push(
        await checkBrowserProxy(proxy, {
          url: options.url,
          timeoutMs,
          headless: config.BROWSER_HEADLESS
        })
      );
    }
    console.table(results);
  });

  withCommonOptions(program.command("faucet").description("run faucet handoff/smoke flow"))
    .action(async (options: CommonOptions) => {
      const config = loadWalletConfig(options);
      await executeTasks(config, ["faucet"], options.dashboard);
    });

  withCommonOptions(program.command("gm").description("run OnChainGM daily flow"))
    .action(async (options: CommonOptions) => {
      const config = loadWalletConfig(options);
      await executeTasks(config, ["gm"], options.dashboard);
    });

  withCommonOptions(program.command("deploy-gm").description("run OnChainGM deploy-contract flow"))
    .action(async (options: CommonOptions) => {
      const config = loadWalletConfig(options);
      await executeTasks(config, ["deploy-gm"], options.dashboard);
    });

  withCommonOptions(program.command("ecosystem").description("run the full LitVM flow: core tasks, GM, deploy-GM, and ecosystem modules"))
    .action(async (options: CommonOptions) => {
      const config = loadWalletConfig(options);
      await executeTasks(config, FULL_FLOW_TASK_NAMES, options.dashboard);
    });

  withCommonOptions(
    program
      .command("run")
      .description("run a comma-separated task list")
      .option("--tasks <tasks>", `tasks to run (${TASK_NAMES.join(",")})`, TASK_NAMES.join(","))
  ).action(async (options: CommonOptions & { tasks: string }) => {
    const config = loadWalletConfig(options);
    await executeTasks(config, parseTaskList(options.tasks), options.dashboard);
  });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
