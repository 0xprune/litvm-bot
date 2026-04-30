import type { Address, Hash, HDAccount } from "viem";

export type TaskName =
  | "faucet"
  | "gm"
  | "deploy-gm"
  | "arkada"
  | "lester"
  | "midashand"
  | "zns"
  | "infinityname"
  | "sweep";

export type WalletContext = {
  index: number;
  path: string;
  address: Address;
  account: HDAccount;
};

export type TaskStatus = "success" | "skipped" | "manual" | "failed" | "dry-run";

export type TaskResult = {
  task: TaskName;
  walletIndex: number;
  address: Address;
  status: TaskStatus;
  txHash?: Hash;
  proxy?: string;
  balance?: string;
  message?: string;
  error?: string;
};

export type TaskHandler = (wallet: WalletContext) => Promise<TaskResult>;

export type DelayRange = {
  minMs: number;
  maxMs: number;
};
