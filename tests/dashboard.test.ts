import { describe, expect, it } from "vitest";
import { applyRunEvent, type DashboardStatus } from "../src/dashboard.js";

function status(): DashboardStatus {
  return {
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dryRun: true,
    proxyMode: "sticky-wallet",
    walletCount: 1,
    tasks: ["sweep"],
    totalActions: 1,
    completedActions: 0,
    counters: {
      success: 0,
      skipped: 0,
      manual: 0,
      failed: 0,
      "dry-run": 0
    },
    rows: [
      {
        walletIndex: 0,
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        proxy: "direct",
        proxyIp: "direct",
        balance: "0.1000 zkLTC",
        currentTask: "-",
        status: "pending",
        txHash: "-",
        error: ""
      }
    ]
  };
}

describe("dashboard status", () => {
  it("updates rows and counters from run events", () => {
    const current = status();

    applyRunEvent(current, {
      type: "task:start",
      wallet: {
        index: 0,
        path: "m/44'/60'/0'/0/0",
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
      } as never,
      task: "sweep",
      timestamp: "2026-01-01T00:00:01.000Z"
    });

    expect(current.rows[0]?.status).toBe("running");
    expect(current.rows[0]?.currentTask).toBe("sweep");

    applyRunEvent(current, {
      type: "task:done",
      result: {
        task: "sweep",
        walletIndex: 0,
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        status: "dry-run",
        proxy: "http://proxy.example.com:823",
        balance: "0.2000 zkLTC"
      },
      timestamp: "2026-01-01T00:00:02.000Z"
    });

    expect(current.completedActions).toBe(1);
    expect(current.counters["dry-run"]).toBe(1);
    expect(current.rows[0]?.proxy).toBe("http://proxy.example.com:823");
    expect(current.rows[0]?.balance).toBe("0.2000 zkLTC");
  });
});
