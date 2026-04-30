import type { BotConfig } from "./config.js";

export type BrowserProxy = {
  server: string;
  username?: string;
  password?: string;
};

export type ProxyMode = "failover" | "sticky-wallet";

type ProxyConfig = Pick<
  BotConfig,
  | "BROWSER_PROXY_SERVER"
  | "BROWSER_PROXY_POOL"
  | "BROWSER_PROXY_USERNAME"
  | "BROWSER_PROXY_PASSWORD"
  | "BROWSER_PROXY_DIRECT_FALLBACK"
> &
  Partial<
    Pick<
      BotConfig,
      "BROWSER_PROXY_MODE" | "BROWSER_PROXY_REQUIRE_UNIQUE" | "WALLET_START_INDEX" | "WALLET_COUNT"
    >
  >;

export type ProxyCheckResult = {
  label: string;
  ok: boolean;
  ms: number;
  body?: string;
  error?: string;
};

type PlaywrightModule = {
  chromium: {
    launch(options: {
      headless: boolean;
      proxy?: BrowserProxy;
    }): Promise<{
      newPage(): Promise<{
        goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
        textContent(selector: string): Promise<string | null>;
      }>;
      close(): Promise<void>;
    }>;
  };
};

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

const DATAIMPULSE_STICKY_MIN_PORT = 10_000;
const DATAIMPULSE_STICKY_MAX_PORT = 20_000;

export function browserProxyCandidates(
  config: ProxyConfig,
  walletIndex?: number
): Array<BrowserProxy | undefined> {
  const mode = config.BROWSER_PROXY_MODE ?? "failover";
  const proxies = configuredBrowserProxies(config);

  if (proxies.length === 0) return [undefined];

  if (mode === "sticky-wallet" && walletIndex !== undefined) {
    const walletCount = config.WALLET_COUNT ?? 1;
    const dataImpulseStickyProxy = dataImpulseStickyProxyForWallet(
      proxies,
      walletIndex,
      config.WALLET_START_INDEX ?? 0
    );

    if (dataImpulseStickyProxy) return [dataImpulseStickyProxy];

    if (config.BROWSER_PROXY_REQUIRE_UNIQUE !== false && proxies.length < walletCount) {
      throw new Error(
        `sticky-wallet proxy mode requires at least ${walletCount} configured proxy entries, but only ${proxies.length} were found.`
      );
    }

    return [assignedWalletProxy(proxies, walletIndex, config.WALLET_START_INDEX ?? 0)];
  }

  return config.BROWSER_PROXY_DIRECT_FALLBACK ? [...proxies, undefined] : proxies;
}

export function configuredBrowserProxies(
  config: Pick<
    BotConfig,
    "BROWSER_PROXY_SERVER" | "BROWSER_PROXY_POOL" | "BROWSER_PROXY_USERNAME" | "BROWSER_PROXY_PASSWORD"
  >
): BrowserProxy[] {
  const entries = [
    config.BROWSER_PROXY_SERVER,
    ...(config.BROWSER_PROXY_POOL
      ? config.BROWSER_PROXY_POOL.split(/[\n,]+/).map((entry) => entry.trim())
      : [])
  ].filter((entry): entry is string => Boolean(entry));

  const proxies = dedupe(
    entries.map((entry) =>
      parseProxyEntry(entry, {
        username: config.BROWSER_PROXY_USERNAME,
        password: config.BROWSER_PROXY_PASSWORD
      })
    )
  );

  return proxies;
}

export function assignedWalletProxy(proxies: BrowserProxy[], walletIndex: number, startIndex = 0): BrowserProxy {
  if (proxies.length === 0) {
    throw new Error("No proxies are configured for sticky wallet assignment.");
  }

  const relativeIndex = walletIndex - startIndex;
  const normalizedIndex = ((relativeIndex % proxies.length) + proxies.length) % proxies.length;
  return proxies[normalizedIndex]!;
}

export function describeProxy(proxy: BrowserProxy | undefined): string {
  if (!proxy) return "direct";
  const auth = proxy.username ? `${maskSecret(proxy.username)}:***@` : "";
  return proxy.server.replace(/^([a-z]+:\/\/)/i, `$1${auth}`);
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function checkBrowserProxy(
  proxy: BrowserProxy | undefined,
  options: {
    url: string;
    timeoutMs: number;
    headless: boolean;
  }
): Promise<ProxyCheckResult> {
  const playwright = (await dynamicImport("playwright")) as PlaywrightModule;
  const startedAt = Date.now();
  let browser: Awaited<ReturnType<PlaywrightModule["chromium"]["launch"]>> | undefined;

  try {
    browser = await playwright.chromium.launch({
      headless: options.headless,
      ...(proxy ? { proxy } : {})
    });
    const page = await browser.newPage();
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    const body = (await page.textContent("body"))?.trim();

    return {
      label: describeProxy(proxy),
      ok: true,
      ms: Date.now() - startedAt,
      body: body?.slice(0, 200)
    };
  } catch (error) {
    return {
      label: describeProxy(proxy),
      ok: false,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function parseProxyEntry(entry: string, defaults: Pick<BrowserProxy, "username" | "password">): BrowserProxy {
  const withScheme = /^[a-z]+:\/\//i.test(entry) ? entry : `http://${entry}`;

  try {
    const url = new URL(withScheme);
    return {
      server: `${url.protocol}//${url.host}`,
      username: url.username ? decodeURIComponent(url.username) : defaults.username,
      password: url.password ? decodeURIComponent(url.password) : defaults.password
    };
  } catch {
    return {
      server: entry,
      username: defaults.username,
      password: defaults.password
    };
  }
}

function dedupe(proxies: BrowserProxy[]): BrowserProxy[] {
  const seen = new Set<string>();
  const unique: BrowserProxy[] = [];

  for (const proxy of proxies) {
    const key = `${proxy.server}|${proxy.username ?? ""}|${proxy.password ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(proxy);
  }

  return unique;
}

function dataImpulseStickyProxyForWallet(
  proxies: BrowserProxy[],
  walletIndex: number,
  startIndex: number
): BrowserProxy | undefined {
  if (proxies.length !== 1) return undefined;

  const proxy = proxies[0]!;
  let url: URL;

  try {
    url = new URL(proxy.server);
  } catch {
    return undefined;
  }

  if (!isDataImpulseHost(url.hostname)) return undefined;

  const configuredPort = Number.parseInt(url.port, 10);
  const isRotatingGateway = configuredPort === 823 || configuredPort === 824;
  const isStickyPort =
    configuredPort >= DATAIMPULSE_STICKY_MIN_PORT && configuredPort <= DATAIMPULSE_STICKY_MAX_PORT;
  if (!isRotatingGateway && !isStickyPort) return undefined;

  const basePort = isStickyPort ? configuredPort : DATAIMPULSE_STICKY_MIN_PORT;
  const relativeIndex = walletIndex - startIndex;
  const targetPort = basePort + relativeIndex;

  if (targetPort < DATAIMPULSE_STICKY_MIN_PORT || targetPort > DATAIMPULSE_STICKY_MAX_PORT) {
    throw new Error(
      `DataImpulse sticky proxy port ${targetPort} is outside ${DATAIMPULSE_STICKY_MIN_PORT}-${DATAIMPULSE_STICKY_MAX_PORT}. Lower WALLET_COUNT or use a smaller starting sticky port.`
    );
  }

  url.port = String(targetPort);

  return {
    ...proxy,
    server: `${url.protocol}//${url.host}`
  };
}

function isDataImpulseHost(hostname: string): boolean {
  return /(^|\.)dataimpulse\.com$/i.test(hostname);
}
