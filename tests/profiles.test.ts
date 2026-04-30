import { describe, expect, it } from "vitest";
import { findRunProfile, RUN_PROFILES } from "../src/profiles.js";

describe("run profiles", () => {
  it("defines daily, ecosystem, tx-farm, and core profiles", () => {
    expect(RUN_PROFILES.map((profile) => profile.id)).toEqual(["daily", "ecosystem-full", "tx-farm", "core"]);
  });

  it("finds a profile by id", () => {
    expect(findRunProfile("tx-farm")?.tasks).toEqual(["gm", "lester", "zns", "infinityname", "sweep"]);
  });
});
