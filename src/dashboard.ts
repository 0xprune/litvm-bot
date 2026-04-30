import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatEther } from "viem";
import { createLitvmPublicClient } from "./client.js";
import type { BotConfig } from "./config.js";
import { browserProxyCandidates, checkBrowserProxy, describeProxy } from "./proxy.js";
import type { RunEvent } from "./runner.js";
import type { TaskName, TaskResult, WalletContext } from "./types.js";

export type DashboardWalletRow = {
  walletIndex: number;
  address: string;
  proxy: string;
  proxyIp: string;
  balance: string;
  currentTask: string;
  status: "pending" | "running" | TaskResult["status"] | "done";
  txHash: string;
  error: string;
};

export type DashboardStatus = {
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  dryRun: boolean;
  proxyMode: string;
  walletCount: number;
  tasks: TaskName[];
  totalActions: number;
  completedActions: number;
  counters: Record<TaskResult["status"], number>;
  rows: DashboardWalletRow[];
};

export class LiveDashboard {
  constructor(
    private status: DashboardStatus,
    private readonly statusFile: string,
    private readonly renderToTerminal: boolean
  ) {}

  async start(): Promise<void> {
    await this.persist();
    this.render();
  }

  async handleEvent(event: RunEvent): Promise<void> {
    applyRunEvent(this.status, event);
    await this.persist();
    this.render();
  }

  snapshot(): DashboardStatus {
    return this.status;
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.statusFile), { recursive: true });
    await writeFile(this.statusFile, `${JSON.stringify(this.status, null, 2)}\n`, "utf8");
  }

  private render(): void {
    if (!this.renderToTerminal) return;

    process.stdout.write("\x1b[2J\x1b[H");
    console.log("LitVM Bot Live Dashboard");
    console.log(`Wallets: ${this.status.walletCount} | Tasks: ${this.status.tasks.length} | Proxy: ${this.status.proxyMode}`);
    console.log(`Progress: ${this.status.completedActions} / ${this.status.totalActions} actions`);
    console.log(
      `Success: ${this.status.counters.success} | Manual: ${this.status.counters.manual} | Failed: ${this.status.counters.failed} | Dry-run: ${this.status.counters["dry-run"]} | Skipped: ${this.status.counters.skipped}`
    );
    console.table(
      this.status.rows.map((row) => ({
        idx: row.walletIndex,
        address: shorten(row.address),
        proxyIp: row.proxyIp,
        balance: row.balance,
        task: row.currentTask,
        status: row.status,
        tx: shorten(row.txHash),
        error: row.error ? row.error.slice(0, 42) : ""
      }))
    );
    console.log(`Status file: ${this.statusFile}`);
  }
}

export async function createLiveDashboard(options: {
  config: BotConfig;
  wallets: WalletContext[];
  tasks: TaskName[];
  render?: boolean;
}): Promise<LiveDashboard> {
  const status = await createInitialStatus(options.config, options.wallets, options.tasks);
  return new LiveDashboard(status, options.config.STATUS_FILE, options.render ?? true);
}

export async function createInitialStatus(
  config: BotConfig,
  wallets: WalletContext[],
  tasks: TaskName[]
): Promise<DashboardStatus> {
  const startedAt = new Date().toISOString();
  const rows = await Promise.all(
    wallets.map(async (wallet) => {
      const proxy = browserProxyCandidates(config, wallet.index)[0];
      const proxyLabel = describeProxy(proxy);
      const [proxyIp, balance] = await Promise.all([resolveProxyIp(config, proxy), resolveBalance(config, wallet)]);

      return {
        walletIndex: wallet.index,
        address: wallet.address,
        proxy: proxyLabel,
        proxyIp,
        balance,
        currentTask: "-",
        status: "pending" as const,
        txHash: "-",
        error: ""
      };
    })
  );

  return {
    startedAt,
    updatedAt: startedAt,
    dryRun: config.dryRun,
    proxyMode: config.BROWSER_PROXY_MODE,
    walletCount: wallets.length,
    tasks,
    totalActions: wallets.length * tasks.length,
    completedActions: 0,
    counters: {
      success: 0,
      skipped: 0,
      manual: 0,
      failed: 0,
      "dry-run": 0
    },
    rows
  };
}

export function applyRunEvent(status: DashboardStatus, event: RunEvent): void {
  status.updatedAt = event.timestamp;

  if (event.type === "task:start") {
    const row = findRow(status, event.wallet.index);
    if (!row) return;
    row.currentTask = event.task;
    row.status = "running";
    row.error = "";
    return;
  }

  if (event.type === "task:done") {
    const row = findRow(status, event.result.walletIndex);
    if (!row) return;
    row.currentTask = event.result.task;
    row.status = event.result.status;
    row.txHash = event.result.txHash ?? row.txHash;
    row.proxy = event.result.proxy ?? row.proxy;
    row.balance = event.result.balance ?? row.balance;
    row.error = event.result.error ?? "";
    status.completedActions += 1;
    status.counters[event.result.status] += 1;
    return;
  }

  if (event.type === "run:done") {
    status.completedAt = event.timestamp;
  }
}

async function resolveProxyIp(config: BotConfig, proxy: ReturnType<typeof browserProxyCandidates>[number]): Promise<string> {
  if (!proxy) return "direct";
  if (!config.DASHBOARD_RESOLVE_PROXY_IP) return "not checked";

  try {
    const result = await checkBrowserProxy(proxy, {
      url: "https://api.ipify.org/?format=json",
      timeoutMs: Math.min(config.BROWSER_TIMEOUT_MS, 30_000),
      headless: true
    });
    if (!result.ok) return "proxy error";
    if (!result.body) return "unknown";
    try {
      const parsed = JSON.parse(result.body) as { ip?: string };
      return parsed.ip ?? result.body.slice(0, 32);
    } catch {
      return result.body.slice(0, 32);
    }
  } catch {
    return "proxy error";
  }
}

async function resolveBalance(config: BotConfig, wallet: WalletContext): Promise<string> {
  try {
    const client = createLitvmPublicClient(config);
    return `${Number(formatEther(await client.getBalance({ address: wallet.address }))).toFixed(4)} zkLTC`;
  } catch {
    return "unknown";
  }
}

function findRow(status: DashboardStatus, walletIndex: number): DashboardWalletRow | undefined {
  return status.rows.find((row) => row.walletIndex === walletIndex);
}

function shorten(value: string): string {
  if (!value || value === "-") return value;
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}
