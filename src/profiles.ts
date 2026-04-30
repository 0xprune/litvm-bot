import type { TaskName } from "./types.js";

export type RunProfile = {
  id: string;
  label: string;
  tasks: TaskName[];
};

export const RUN_PROFILES: RunProfile[] = [
  {
    id: "daily",
    label: "Daily: faucet, GM, deploy-GM, ZNS, Sweep",
    tasks: ["faucet", "gm", "deploy-gm", "zns", "sweep"]
  },
  {
    id: "ecosystem-full",
    label: "Full flow: core LitVM, GM, deploy-GM, all ecosystem modules",
    tasks: ["faucet", "gm", "deploy-gm", "arkada", "lester", "midashand", "zns", "infinityname", "sweep"]
  },
  {
    id: "tx-farm",
    label: "TX farm: GM, Lester, ZNS, InfinityName, Sweep",
    tasks: ["gm", "lester", "zns", "infinityname", "sweep"]
  },
  {
    id: "core",
    label: "Core: faucet, GM, deploy-GM",
    tasks: ["faucet", "gm", "deploy-gm"]
  }
];

export function findRunProfile(id: string): RunProfile | undefined {
  return RUN_PROFILES.find((profile) => profile.id === id);
}
