# LitVM LiteForge Bot

CLI automation bot for LitVM LiteForge testnet. It is onchain-first for RPC-safe actions and falls back to browser/manual handoff when a site needs wallet UI, CAPTCHA, or undiscovered contract metadata.

## Setup

```bash
npm install
cp .env.example .env
npm run bot -- wallets
```

Use a testnet-only mnemonic. The CLI never prints private keys.

## Commands

```bash
npm run bot
npm run bot -- menu
npm run bot -- wallets
npm run bot -- balance
npm run bot -- proxy-check
npm run bot -- web-dashboard
npm run bot -- faucet
npm run bot -- gm --dry-run
npm run bot -- deploy-gm --dry-run
npm run bot -- ecosystem --dry-run
npm run bot -- ecosystem --dashboard --wallet-count 25 --concurrency 5 --browser-concurrency 2
npm run bot -- run --tasks faucet,gm,deploy-gm --dry-run
npm run bot -- run --tasks arkada,lester,midashand,zns,infinityname,sweep --dry-run
npm run bot -- run --tasks sweep --dashboard --dry-run
```

`npm run bot -- ecosystem` runs the full flow in this order: LitVM portal/faucet, OnChainGM daily GM, OnChainGM deploy-contract, Arkada, Lester, MidasHand, ZNS, InfinityName, and Sweep. Badge minting is intentionally not included.

`npm run bot` opens the interactive menu. From there you can select tasks with checkboxes, choose how many wallets to run, run the full LitVM flow, check balances, check proxies, or export wallet backups.

Menu additions:

- `Run profile`: run saved presets like daily, ecosystem full, tx farm, or core.
- `Resume failed/manual tasks`: retry only the latest entries from `logs/transactions.jsonl` that ended as `failed` or `manual`.
- `Wallet health check`: show balance, gas status, and latest task status per wallet.
- `Config wizard`: update `.env` values from the menu.

`dry-run` means simulation mode. The bot derives wallets and prepares/logs what it would do, but it does not broadcast transactions.

`--concurrency` controls how many wallets are active at the same time. `--browser-concurrency` controls how many Chromium sessions can be open at the same time. For local runs, start around `--concurrency 5 --browser-concurrency 2`; tasks inside each wallet still stay ordered, so faucet/balance verification finishes before GM and ecosystem actions for that wallet.

`--dashboard` opens a live CLI dashboard and writes `logs/status.json` with wallet/task/proxy/balance/progress state. The dashboard includes wallet index, shortened address, assigned proxy/IP, balance, active task, status, tx hash, and error summary.

The web dashboard reads the same status file:

```bash
npm run bot -- web-dashboard --env-file .env
```

Default URL: `http://127.0.0.1:8787`.

Wallet backup export writes a plaintext TXT file in this format:

```text
address | privateKey
0x... | 0x...
```

The default output folder is `exports/`, which is ignored by git.

## LitVM Defaults

- Chain ID: `4441`
- Native token: `zkLTC`
- RPC: `https://liteforge.rpc.caldera.xyz/http`
- Explorer: `https://liteforge.explorer.caldera.xyz`

## Ecosystem Modules

The ecosystem modules use a Playwright browser with an injected EIP-1193 wallet provider backed by the derived viem account. That lets normal dApp wallet calls such as account requests, signatures, and LitVM transactions run without a browser extension.

- `arkada`: connect and verify wallet on LitVM, with optional Arc verification.
- `lester`: fill and deploy an ERC-20 token form.
- `midashand`: attempt daily claim, rewards/quest, USDC faucet, and market activity.
- `zns`: run the LiteForge/ZNS deploy-all style flow.
- `infinityname`: register a LitVM testnet domain label.
- `sweep`: mint NFTs one by one, capped by `SWEEP_MINT_COUNT` from 1 to 20.

If a site asks for CAPTCHA, social login, anti-bot verification, or a step that cannot be safely inferred, the bot returns a manual handoff result instead of bypassing it.

## Playwright

Browser automation is optional. If you want UI fallback smoke checks, install Playwright and browsers separately:

```bash
npm install playwright
npx playwright install chromium
```

## Proxy Note

The bot supports optional Playwright proxy routing for connectivity/session isolation. CAPTCHA, rate limits, and verification gates are never bypassed.

```env
BROWSER_PROXY_SERVER=http://host:port
BROWSER_PROXY_POOL=http://backup-a:port,http://backup-b:port
BROWSER_PROXY_USERNAME=username
BROWSER_PROXY_PASSWORD=password
BROWSER_PROXY_MODE=sticky-wallet
BROWSER_PROXY_REQUIRE_UNIQUE=false
BROWSER_PROXY_DIRECT_FALLBACK=false
BROWSER_CONCURRENCY=3
DASHBOARD_RESOLVE_PROXY_IP=false
```

`BROWSER_PROXY_MODE=sticky-wallet` assigns one proxy entry to each wallet index for project-operator maintenance workflows. With `BROWSER_PROXY_REQUIRE_UNIQUE=true`, the bot stops if the current wallet range has more wallets than configured proxy entries.

DataImpulse special case: their docs define `823` as the HTTP/HTTPS rotating gateway and `10000-20000` as sticky session ports. If you configure one DataImpulse server such as `http://gw.dataimpulse.com:823`, sticky-wallet mode automatically expands wallet routes to sticky ports: wallet 0 uses `:10000`, wallet 1 uses `:10001`, and so on. If you start from a sticky port such as `:10010`, that port becomes the base.

Browser task logs include the proxy route used for that wallet/task. By default the dashboard shows the assigned route and skips live exit-IP checks because checking every proxy IP launches extra browsers. Set `DASHBOARD_RESOLVE_PROXY_IP=true` or pass `--resolve-proxy-ip` only when you need to inspect exit IPs.

Check configured browser routes:

```bash
npm run bot -- proxy-check
npm run bot -- proxy-check --url https://api.ipify.org/?format=json
```
