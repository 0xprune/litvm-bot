import type { BotConfig } from "../config.js";
import type { TaskHandler, TaskName } from "../types.js";
import {
  createArkadaTask,
  createInfinityNameTask,
  createLesterTask,
  createMidasHandTask,
  createSweepTask,
  createZnsTask
} from "./ecosystem.js";
import { createDeployGmTask, createFaucetTask, createGmTask } from "./litvm.js";

export const CORE_TASK_NAMES: TaskName[] = ["faucet", "gm", "deploy-gm"];
export const ECOSYSTEM_TASK_NAMES: TaskName[] = ["arkada", "lester", "midashand", "zns", "infinityname", "sweep"];
export const FULL_FLOW_TASK_NAMES: TaskName[] = [...CORE_TASK_NAMES, ...ECOSYSTEM_TASK_NAMES];
export const TASK_NAMES: TaskName[] = [...CORE_TASK_NAMES, ...ECOSYSTEM_TASK_NAMES];

export function parseTaskList(input: string): TaskName[] {
  const requested = input
    .split(",")
    .map((task) => task.trim())
    .filter(Boolean);

  const invalid = requested.filter((task) => !TASK_NAMES.includes(task as TaskName));
  if (invalid.length > 0) {
    throw new Error(`Unknown task(s): ${invalid.join(", ")}. Valid tasks: ${TASK_NAMES.join(", ")}`);
  }

  const unique = [...new Set(requested)] as TaskName[];
  if (unique.length === 0) {
    throw new Error("At least one task is required.");
  }

  return unique;
}

export function createTaskHandlers(config: BotConfig): Record<TaskName, TaskHandler> {
  return {
    faucet: createFaucetTask(config),
    gm: createGmTask(config),
    "deploy-gm": createDeployGmTask(config),
    arkada: createArkadaTask(config),
    lester: createLesterTask(config),
    midashand: createMidasHandTask(config),
    zns: createZnsTask(config),
    infinityname: createInfinityNameTask(config),
    sweep: createSweepTask(config)
  };
}
