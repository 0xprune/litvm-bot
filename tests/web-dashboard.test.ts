import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readStatusFile, webDashboardHtml } from "../src/web-dashboard.js";

let tempDir: string | undefined;

describe("web dashboard", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("serves an HTML shell with API polling", () => {
    const html = webDashboardHtml();
    expect(html).toContain("LitVM Bot Dashboard");
    expect(html).toContain("/api/status");
  });

  it("returns not-ready status when status file is missing", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "litvm-web-"));
    await expect(readStatusFile(path.join(tempDir, "missing.json"))).resolves.toEqual({
      ready: false,
      message: `Status file not found: ${path.join(tempDir, "missing.json")}`
    });
  });

});
