import { describe, expect, it } from "vitest";
import { assignedWalletProxy, browserProxyCandidates, describeProxy } from "../src/proxy.js";

describe("browserProxyCandidates", () => {
  it("returns direct browser mode when no proxy is configured", () => {
    expect(
      browserProxyCandidates({
        BROWSER_PROXY_DIRECT_FALLBACK: false
      })
    ).toEqual([undefined]);
  });

  it("parses single proxy and pool entries with shared credentials", () => {
    const candidates = browserProxyCandidates({
      BROWSER_PROXY_SERVER: "gw.example.com:823",
      BROWSER_PROXY_POOL: "http://backup-a.example.com:823,https://backup-b.example.com:9443",
      BROWSER_PROXY_USERNAME: "user",
      BROWSER_PROXY_PASSWORD: "pass",
      BROWSER_PROXY_DIRECT_FALLBACK: false
    });

    expect(candidates).toEqual([
      { server: "http://gw.example.com:823", username: "user", password: "pass" },
      { server: "http://backup-a.example.com:823", username: "user", password: "pass" },
      { server: "https://backup-b.example.com:9443", username: "user", password: "pass" }
    ]);
  });

  it("supports inline credentials and optional direct fallback", () => {
    const candidates = browserProxyCandidates({
      BROWSER_PROXY_POOL: "http://alice:secret@proxy.example.com:8080",
      BROWSER_PROXY_DIRECT_FALLBACK: true
    });

    expect(candidates).toEqual([
      { server: "http://proxy.example.com:8080", username: "alice", password: "secret" },
      undefined
    ]);
  });

  it("assigns a stable proxy slot by wallet index in sticky mode", () => {
    const candidates = browserProxyCandidates(
      {
        BROWSER_PROXY_POOL: "http://proxy-a.example.com:8080,http://proxy-b.example.com:8080",
        BROWSER_PROXY_MODE: "sticky-wallet",
        BROWSER_PROXY_REQUIRE_UNIQUE: true,
        WALLET_START_INDEX: 10,
        WALLET_COUNT: 2,
        BROWSER_PROXY_DIRECT_FALLBACK: false
      },
      11
    );

    expect(candidates).toEqual([{ server: "http://proxy-b.example.com:8080" }]);
  });

  it("requires enough proxies for unique sticky wallet assignment", () => {
    expect(() =>
      browserProxyCandidates(
        {
          BROWSER_PROXY_POOL: "http://proxy-a.example.com:8080",
          BROWSER_PROXY_MODE: "sticky-wallet",
          BROWSER_PROXY_REQUIRE_UNIQUE: true,
          WALLET_START_INDEX: 0,
          WALLET_COUNT: 2,
          BROWSER_PROXY_DIRECT_FALLBACK: false
        },
        0
      )
    ).toThrow(/requires at least 2/);
  });

  it("expands one DataImpulse rotating gateway into sticky ports per wallet", () => {
    expect(
      browserProxyCandidates(
        {
          BROWSER_PROXY_SERVER: "http://gw.dataimpulse.com:823",
          BROWSER_PROXY_USERNAME: "user",
          BROWSER_PROXY_PASSWORD: "pass",
          BROWSER_PROXY_MODE: "sticky-wallet",
          BROWSER_PROXY_REQUIRE_UNIQUE: true,
          WALLET_START_INDEX: 0,
          WALLET_COUNT: 25,
          BROWSER_PROXY_DIRECT_FALLBACK: false
        },
        24
      )
    ).toEqual([{ server: "http://gw.dataimpulse.com:10024", username: "user", password: "pass" }]);
  });

  it("uses a configured DataImpulse sticky port as the wallet port base", () => {
    expect(
      browserProxyCandidates(
        {
          BROWSER_PROXY_SERVER: "http://gw.dataimpulse.com:10010",
          BROWSER_PROXY_MODE: "sticky-wallet",
          BROWSER_PROXY_REQUIRE_UNIQUE: true,
          WALLET_START_INDEX: 5,
          WALLET_COUNT: 3,
          BROWSER_PROXY_DIRECT_FALLBACK: false
        },
        7
      )
    ).toEqual([{ server: "http://gw.dataimpulse.com:10012" }]);
  });

  it("wraps sticky assignment when unique requirement is disabled", () => {
    expect(
      assignedWalletProxy(
        [{ server: "http://proxy-a.example.com:8080" }, { server: "http://proxy-b.example.com:8080" }],
        4,
        0
      )
    ).toEqual({ server: "http://proxy-a.example.com:8080" });
  });

  it("masks proxy passwords in labels", () => {
    expect(
      describeProxy({
        server: "http://proxy.example.com:8080",
        username: "alice",
        password: "secret"
      })
    ).toBe("http://****:***@proxy.example.com:8080");
  });
});
