import { describe, expect, it } from "vitest";
import { randomDelayMs } from "../src/delay.js";

describe("randomDelayMs", () => {
  it("keeps values within inclusive bounds", () => {
    expect(randomDelayMs({ minMs: 10, maxMs: 20 }, () => 0)).toBe(10);
    expect(randomDelayMs({ minMs: 10, maxMs: 20 }, () => 0.999)).toBe(20);
  });

  it("allows a fixed delay", () => {
    expect(randomDelayMs({ minMs: 42, maxMs: 42 })).toBe(42);
  });

  it("rejects inverted ranges", () => {
    expect(() => randomDelayMs({ minMs: 20, maxMs: 10 })).toThrow(/maxMs/);
  });
});
