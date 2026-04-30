import type { BotConfig } from "./config.js";
import { randomDelayMs, sleep } from "./delay.js";
import { appendTaskLog, logger } from "./logger.js";
import type { TaskHandler, TaskName, TaskResult, WalletContext } from "./types.js";

export type RunEvent =
  | {
      type: "run:start";
      wallets: WalletContext[];
      tasks: TaskName[];
      totalActions: number;
      timestamp: string;
    }
  | {
      type: "task:start";
      wallet: WalletContext;
      task: TaskName;
      timestamp: string;
    }
  | {
      type: "task:done";
      result: TaskResult;
      timestamp: string;
    }
  | {
      type: "wallet:delay";
      delayMs: number;
      timestamp: string;
    }
  | {
      type: "run:done";
      results: TaskResult[];
      timestamp: string;
    };

export type RunTasksOptions = {
  wallets: WalletContext[];
  tasks: TaskName[];
  handlers: Record<TaskName, TaskHandler>;
  config: BotConfig;
  onEvent?: (event: RunEvent) => void | Promise<void>;
  silent?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

async function emit(options: Pick<RunTasksOptions, "onEvent">, event: RunEvent): Promise<void> {
  await options.onEvent?.(event);
}

async function runWalletTasks(
  wallet: WalletContext,
  tasks: TaskName[],
  handlers: Record<TaskName, TaskHandler>,
  config: BotConfig,
  options: Pick<RunTasksOptions, "onEvent" | "silent">
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];

  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
    const task = tasks[taskIndex]!;
    if (!options.silent) logger.info({ wallet: wallet.index, address: wallet.address, task }, "running task");
    await emit(options, { type: "task:start", wallet, task, timestamp: nowIso() });
    const result = await handlers[task](wallet);
    await appendTaskLog(config.LOG_DIR, result);
    if (!options.silent) logger.info({ result }, "task completed");
    await emit(options, { type: "task:done", result, timestamp: nowIso() });
    results.push(result);

    if (shouldStopWalletAfter(result)) {
      const remainingTasks = tasks.slice(taskIndex + 1);
      const skippedResults = await skipRemainingTasks(wallet, remainingTasks, config, options);
      results.push(...skippedResults);
      break;
    }
  }

  return results;
}

function shouldStopWalletAfter(result: TaskResult): boolean {
  return result.task === "faucet" && !["success", "skipped", "dry-run"].includes(result.status);
}

async function skipRemainingTasks(
  wallet: WalletContext,
  tasks: TaskName[],
  config: BotConfig,
  options: Pick<RunTasksOptions, "onEvent" | "silent">
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];

  for (const task of tasks) {
    const result: TaskResult = {
      task,
      walletIndex: wallet.index,
      address: wallet.address,
      status: "skipped",
      message: "Skipped because the faucet step did not fund this wallet."
    };

    if (!options.silent) logger.info({ wallet: wallet.index, address: wallet.address, task }, "skipping task");
    await emit(options, { type: "task:start", wallet, task, timestamp: nowIso() });
    await appendTaskLog(config.LOG_DIR, result);
    await emit(options, { type: "task:done", result, timestamp: nowIso() });
    results.push(result);
  }

  return results;
}

export async function runTasks(options: RunTasksOptions): Promise<TaskResult[]> {
  const { wallets, tasks, handlers, config } = options;
  const results: TaskResult[] = [];
  let cursor = 0;

  await emit(options, {
    type: "run:start",
    wallets,
    tasks,
    totalActions: wallets.length * tasks.length,
    timestamp: nowIso()
  });

  async function worker() {
    while (cursor < wallets.length) {
      const wallet = wallets[cursor];
      cursor += 1;
      if (!wallet) continue;

      results.push(...(await runWalletTasks(wallet, tasks, handlers, config, options)));

      if (cursor < wallets.length) {
        const delayMs = randomDelayMs({
          minMs: config.DELAY_MIN_MS,
          maxMs: config.DELAY_MAX_MS
        });
        if (!options.silent) logger.info({ delayMs }, "waiting before next wallet");
        await emit(options, { type: "wallet:delay", delayMs, timestamp: nowIso() });
        await sleep(delayMs);
      }
    }
  }

  const concurrency = Math.min(config.CONCURRENCY, wallets.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await emit(options, { type: "run:done", results, timestamp: nowIso() });
  return results;
}
