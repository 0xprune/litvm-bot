import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { updateEnvFile } from "../src/env-file.js";

let tempDir: string | undefined;

describe("updateEnvFile", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("updates existing keys and appends new keys", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "litvm-env-"));
    const filePath = path.join(tempDir, ".env");
    await writeFile(filePath, "WALLET_COUNT=10\nOLD=value\n", "utf8");

    await updateEnvFile(filePath, {
      WALLET_COUNT: 3,
      MNEMONIC: "test test test test test test test test test test test junk"
    });

    expect(await readFile(filePath, "utf8")).toBe(
      'WALLET_COUNT=3\nOLD=value\nMNEMONIC="test test test test test test test test test test test junk"\n'
    );
  });
});
