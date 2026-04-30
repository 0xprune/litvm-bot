import { describe, expect, it } from "vitest";
import { FULL_FLOW_TASK_NAMES, parseTaskList } from "../src/tasks/index.js";

describe("task parsing", () => {
  it("deduplicates and preserves requested order", () => {
    expect(parseTaskList("faucet,gm,faucet,deploy-gm")).toEqual(["faucet", "gm", "deploy-gm"]);
  });

  it("accepts ecosystem tasks", () => {
    expect(parseTaskList("arkada,lester,midashand,zns,infinityname,sweep")).toEqual([
      "arkada",
      "lester",
      "midashand",
      "zns",
      "infinityname",
      "sweep"
    ]);
  });

  it("keeps the full LitVM flow in portal-first order", () => {
    expect(FULL_FLOW_TASK_NAMES).toEqual([
      "faucet",
      "gm",
      "deploy-gm",
      "arkada",
      "lester",
      "midashand",
      "zns",
      "infinityname",
      "sweep"
    ]);
  });

  it("rejects unknown tasks", () => {
    expect(() => parseTaskList("gm,unknown")).toThrow(/Unknown task/);
  });
});
