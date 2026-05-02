import {
  hexToString,
  isAddress,
  isHex,
  numberToHex,
  type Address,
  type Hash,
  type Hex
} from "viem";
import type { BotConfig } from "../config.js";
import { createLitvmPublicClient, createLitvmWalletClient } from "../client.js";
import { litvmLiteForge } from "../constants.js";
import { MissingOptionalDependencyError } from "../errors.js";
import { browserProxyCandidates } from "../proxy.js";
import type { TaskName, TaskResult, WalletContext } from "../types.js";

export type BrowserSmokeResult = {
  title?: string;
  matchedText: boolean;
};

type BrowserLaunchOptions = {
  headless: boolean;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
};

type PlaywrightModule = {
  chromium: {
    launch(options: BrowserLaunchOptions): Promise<Browser>;
  };
};

type Browser = {
  newPage(): Promise<Page>;
  newContext(options?: Record<string, unknown>): Promise<BrowserContext>;
  close(): Promise<void>;
};

type BrowserContext = {
  newPage(): Promise<Page>;
  exposeFunction(name: string, callback: (payload: RpcPayload) => Promise<unknown>): Promise<void>;
  addInitScript(script: string): Promise<void>;
  close(): Promise<void>;
};

type Page = {
  goto(url: string, options: { waitUntil: "domcontentloaded" | "networkidle"; timeout: number }): Promise<unknown>;
  title(): Promise<string>;
  textContent(selector: string): Promise<string | null>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<R>(fn: (...args: unknown[]) => R | Promise<R>, ...args: unknown[]): Promise<R>;
  getByRole(role: string, options: { name: RegExp }): Locator;
  getByText(text: RegExp): Locator;
  getByLabel(text: RegExp): Locator;
  getByPlaceholder(text: RegExp): Locator;
  locator(selector: string): Locator;
};

type Locator = {
  first(): Locator;
  nth(index: number): Locator;
  click(options?: { timeout?: number; force?: boolean }): Promise<void>;
  fill(value: string, options?: { timeout?: number }): Promise<void>;
};

type RpcPayload = {
  method: string;
  params?: unknown;
};

type Eip1193Transaction = {
  from?: Address;
  to?: Address;
  value?: string | number | bigint;
  data?: Hex;
  gas?: string | number | bigint;
  gasPrice?: string | number | bigint;
  maxFeePerGas?: string | number | bigint;
  maxPriorityFeePerGas?: string | number | bigint;
  nonce?: string | number;
};

export type BrowserAction =
  | { kind: "connect"; optional?: boolean }
  | { kind: "click"; name: string; match: RegExp; optional?: boolean; repeat?: number }
  | { kind: "fill"; name: string; match: RegExp; value: string; optional?: boolean; inputIndex?: number }
  | { kind: "scroll"; pixels: number }
  | { kind: "wait"; ms: number };

export type BrowserFlowSpec = {
  task: TaskName;
  url: string;
  description: string;
  actions: BrowserAction[];
  expectTx?: boolean;
};

export type BrowserFlowResult = TaskResult & {
  txHashes?: Hash[];
};

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

let activeBrowserFlows = 0;
const browserFlowQueue: Array<() => void> = [];
const PLAYWRIGHT_BROWSER_INSTALL_MESSAGE =
  "Playwright browser executable is missing. Run `npx playwright install chromium` first. On Linux/VPS, use `npx playwright install --with-deps chromium` if system dependencies are also missing.";

export async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return (await dynamicImport("playwright")) as PlaywrightModule;
  } catch {
    throw new MissingOptionalDependencyError("playwright");
  }
}

export async function smokeCheckPage(url: string, expectedText?: RegExp): Promise<BrowserSmokeResult> {
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const title = await page.title();
    const content = await page.textContent("body");
    return {
      title,
      matchedText: expectedText ? expectedText.test(content ?? "") : true
    };
  } finally {
    await browser.close();
  }
}

export async function runBrowserFlow(
  config: BotConfig,
  wallet: WalletContext,
  spec: BrowserFlowSpec
): Promise<BrowserFlowResult> {
  const base = {
    task: spec.task,
    walletIndex: wallet.index,
    address: wallet.address
  };

  if (config.dryRun) {
    return {
      ...base,
      status: "dry-run",
      message: `Would run ${spec.description} at ${spec.url} with ${spec.actions.length} browser actions.`
    };
  }

  let session: BrowserSession | undefined;
  const releaseBrowserSlot = await acquireBrowserFlowSlot(config.BROWSER_CONCURRENCY);

  try {
    session = await createBrowserSession(config, wallet);
    await session.page.goto(spec.url, {
      waitUntil: "domcontentloaded",
      timeout: config.BROWSER_TIMEOUT_MS
    });

    for (const action of spec.actions) {
      await runBrowserAction(session.page, action, config.BROWSER_TIMEOUT_MS);
    }

    await session.page.waitForTimeout(2_000);
    const txHashes = session.txHashes;
    const hasExpectedTx = !spec.expectTx || txHashes.length > 0;

    return {
      ...base,
      status: hasExpectedTx ? "success" : "manual",
      txHash: txHashes[0],
      proxy: session.proxyLabel,
      txHashes,
      message: hasExpectedTx
        ? `${spec.description} completed via ${session.proxyLabel}. ${txHashes.length} transaction(s) submitted.`
        : `${spec.description} reached the UI via ${session.proxyLabel}, but no transaction was submitted. Manual review may be required.`
    };
  } catch (error) {
    const rawError = error instanceof Error ? error.message : String(error);
    const missingBrowser = isPlaywrightBrowserInstallError(rawError);

    return {
      ...base,
      status: missingBrowser ? "failed" : "manual",
      message: missingBrowser
        ? PLAYWRIGHT_BROWSER_INSTALL_MESSAGE
        : `${spec.description} could not complete automatically. Manual handoff may be required at ${spec.url}.`,
      error: rawError
    };
  } finally {
    try {
      await session?.close();
    } finally {
      releaseBrowserSlot();
    }
  }
}

function isPlaywrightBrowserInstallError(message: string): boolean {
  return /Executable doesn't exist/i.test(message) && /playwright install/i.test(message);
}

async function acquireBrowserFlowSlot(limit: number): Promise<() => void> {
  while (activeBrowserFlows >= limit) {
    await new Promise<void>((resolve) => browserFlowQueue.push(resolve));
  }

  activeBrowserFlows += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeBrowserFlows -= 1;
    browserFlowQueue.shift()?.();
  };
}

type BrowserSession = {
  page: Page;
  txHashes: Hash[];
  proxyLabel: string;
  close(): Promise<void>;
};

async function createBrowserSession(config: BotConfig, wallet: WalletContext): Promise<BrowserSession> {
  const playwright = await loadPlaywright();
  const txHashes: Hash[] = [];
  let lastError: unknown;

  for (const proxy of browserProxyCandidates(config, wallet.index)) {
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try {
      browser = await playwright.chromium.launch({
        headless: config.BROWSER_HEADLESS,
        ...(proxy ? { proxy } : {})
      });
      context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1365, height: 900 }
      });

      await context.exposeFunction("__litvmWalletRequest", async (payload: RpcPayload) => {
        return await handleWalletRpc(config, wallet, payload, txHashes);
      });
      await context.addInitScript(createProviderInitScript(wallet.address, config.CHAIN_ID));

      const page = await context.newPage();

      return {
        page,
        txHashes,
        proxyLabel: proxy ? `${proxy.server}${proxy.username ? ` as ${proxy.username}` : ""}` : "direct",
        async close() {
          await context?.close();
          await browser?.close();
        }
      };
    } catch (error) {
      lastError = error;
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function handleWalletRpc(
  config: BotConfig,
  wallet: WalletContext,
  payload: RpcPayload,
  txHashes: Hash[]
): Promise<unknown> {
  const method = payload.method;
  const params = Array.isArray(payload.params) ? payload.params : payload.params === undefined ? [] : [payload.params];
  const publicClient = createLitvmPublicClient(config);
  const walletClient = createLitvmWalletClient(config, wallet.account);

  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts":
      return [wallet.address];
    case "eth_chainId":
      return numberToHex(config.CHAIN_ID);
    case "net_version":
      return String(config.CHAIN_ID);
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain":
      return null;
    case "wallet_getPermissions":
      return [{ parentCapability: "eth_accounts", caveats: [] }];
    case "wallet_requestPermissions":
      return [{ parentCapability: "eth_accounts", caveats: [{ type: "restrictReturnedAccounts", value: [wallet.address] }] }];
    case "wallet_watchAsset":
      return true;
    case "personal_sign":
    case "eth_sign":
      return await wallet.account.signMessage({ message: parseSignMessage(params) });
    case "eth_signTypedData":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4":
      return await wallet.account.signTypedData(parseTypedData(params));
    case "eth_sendTransaction": {
      const tx = params[0] as Eip1193Transaction | undefined;
      if (!tx) throw new Error("eth_sendTransaction missing transaction object");
      if (tx.from && tx.from.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error(`Transaction from ${tx.from} does not match wallet ${wallet.address}`);
      }

      const txRequest = {
        account: wallet.account,
        chain: litvmLiteForge,
        to: tx.to,
        data: tx.data,
        value: quantityToBigInt(tx.value),
        gas: quantityToBigInt(tx.gas),
        gasPrice: quantityToBigInt(tx.gasPrice),
        maxFeePerGas: quantityToBigInt(tx.maxFeePerGas),
        maxPriorityFeePerGas: quantityToBigInt(tx.maxPriorityFeePerGas),
        nonce: quantityToNumber(tx.nonce)
      };
      const txHash = await walletClient.sendTransaction(txRequest as Parameters<typeof walletClient.sendTransaction>[0]);
      txHashes.push(txHash);
      return txHash;
    }
    default:
      return await publicClient.request({
        method: method as never,
        params: params as never
      });
  }
}

async function runBrowserAction(page: Page, action: BrowserAction, timeoutMs: number): Promise<void> {
  switch (action.kind) {
    case "connect":
      await clickFirst(page, [/connect wallet/i, /^connect$/i, /wallet/i], timeoutMs, action.optional);
      await page.waitForTimeout(1_500);
      await clickFirst(page, [/metamask/i, /injected/i, /browser wallet/i, /walletconnect/i], 5_000, true);
      await page.waitForTimeout(2_000);
      return;
    case "click": {
      const repeat = action.repeat ?? 1;
      for (let i = 0; i < repeat; i += 1) {
        await clickFirst(page, [action.match], timeoutMs, action.optional);
        await page.waitForTimeout(1_500);
      }
      return;
    }
    case "fill":
      await fillFirst(page, action.match, action.value, timeoutMs, action.optional, action.inputIndex);
      await page.waitForTimeout(500);
      return;
    case "scroll":
      await page.evaluate((pixels) => {
        (globalThis as unknown as { scrollBy: (x: number, y: number) => void }).scrollBy(0, Number(pixels));
      }, action.pixels);
      await page.waitForTimeout(1_000);
      return;
    case "wait":
      await page.waitForTimeout(action.ms);
      return;
  }
}

async function clickFirst(page: Page, patterns: RegExp[], timeoutMs: number, optional = false): Promise<void> {
  const errors: string[] = [];

  for (const pattern of patterns) {
    const candidates = [
      () => page.getByRole("button", { name: pattern }).first(),
      () => page.getByText(pattern).first()
    ];

    for (const candidate of candidates) {
      try {
        await candidate().click({ timeout: Math.min(timeoutMs, 10_000), force: true });
        return;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (!optional) {
    throw new Error(`Could not click ${patterns.map((pattern) => pattern.source).join(" or ")}: ${errors.at(-1) ?? "not found"}`);
  }
}

async function fillFirst(
  page: Page,
  pattern: RegExp,
  value: string,
  timeoutMs: number,
  optional = false,
  inputIndex?: number
): Promise<void> {
  const candidates = [
    () => page.getByLabel(pattern).first(),
    () => page.getByPlaceholder(pattern).first(),
    () => page.locator("input").nth(inputIndex ?? 0)
  ];
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      await candidate().fill(value, { timeout: Math.min(timeoutMs, 10_000) });
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!optional) {
    throw new Error(`Could not fill ${pattern.source}: ${errors.at(-1) ?? "not found"}`);
  }
}

function parseSignMessage(params: unknown[]): string | { raw: Hex } {
  const first = params[0];
  const second = params[1];
  const message = isAddress(String(first)) ? second : first;
  if (typeof message === "string" && isHex(message)) {
    try {
      return hexToString(message as Hex);
    } catch {
      return { raw: message as Hex };
    }
  }
  return String(message ?? "");
}

function parseTypedData(params: unknown[]): Parameters<WalletContext["account"]["signTypedData"]>[0] {
  const data = params.find((value) => typeof value === "string" && value.trim().startsWith("{"));
  if (typeof data !== "string") {
    throw new Error("Typed data payload was not found");
  }
  return JSON.parse(data) as Parameters<WalletContext["account"]["signTypedData"]>[0];
}

function quantityToBigInt(value: Eip1193Transaction[keyof Eip1193Transaction]): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value !== "string" || value === "") return undefined;
  return BigInt(value);
}

function quantityToNumber(value: Eip1193Transaction[keyof Eip1193Transaction]): number | undefined {
  const parsed = quantityToBigInt(value);
  return parsed === undefined ? undefined : Number(parsed);
}

function createProviderInitScript(address: Address, chainId: number): string {
  return `
(() => {
  const listeners = new Map();
  const chainId = "${numberToHex(chainId)}";
  const address = "${address}";
  const emit = (event, payload) => {
    for (const listener of listeners.get(event) || []) listener(payload);
  };
  const request = async ({ method, params }) => {
    const result = await window.__litvmWalletRequest({ method, params });
    if (method === "eth_requestAccounts") emit("accountsChanged", [address]);
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") emit("chainChanged", chainId);
    return result;
  };
  const provider = {
    isMetaMask: true,
    isConnected: () => true,
    selectedAddress: address,
    chainId,
    networkVersion: String(${chainId}),
    request,
    enable: () => request({ method: "eth_requestAccounts" }),
    on: (event, listener) => {
      const current = listeners.get(event) || [];
      current.push(listener);
      listeners.set(event, current);
      return provider;
    },
    removeListener: (event, listener) => {
      const current = listeners.get(event) || [];
      listeners.set(event, current.filter((item) => item !== listener));
      return provider;
    },
    send: (methodOrPayload, paramsOrCallback) => {
      if (typeof methodOrPayload === "string") return request({ method: methodOrPayload, params: paramsOrCallback });
      request(methodOrPayload)
        .then((result) => paramsOrCallback(null, { id: methodOrPayload.id, jsonrpc: "2.0", result }))
        .catch((error) => paramsOrCallback(error, null));
    },
    sendAsync: (payload, callback) => {
      request(payload)
        .then((result) => callback(null, { id: payload.id, jsonrpc: "2.0", result }))
        .catch((error) => callback(error, null));
    }
  };
  Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
  const detail = {
    info: {
      uuid: "litvm-liteforge-bot",
      name: "LitVM Bot Wallet",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      rdns: "local.litvm.bot"
    },
    provider
  };
  window.addEventListener("eip6963:requestProvider", () => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  });
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
})();
`;
}
