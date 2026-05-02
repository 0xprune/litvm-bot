# ⚡ LitVM LiteForge Automation Bot

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-Browser%20Automation-2ead33?logo=playwright&logoColor=white)
![Network](https://img.shields.io/badge/LitVM-LiteForge%20Testnet-6d5dfc)
![Status](https://img.shields.io/badge/status-active-12b886)

Automated CLI + dashboard bot for the **LitVM LiteForge testnet**.  
It derives multiple EVM wallets from one mnemonic, routes browser sessions through optional sticky proxies, runs LitVM/OnChainGM/ecosystem tasks, and keeps a realtime local status file for monitoring.

> ⚠️ Testnet only. Use a fresh testnet mnemonic. Never use a wallet that holds real funds.

## ✨ Features

- 🧠 **Mnemonic wallet engine**: derive many EVM wallets from one 12-word phrase.
- 🧾 **Safe wallet output**: address listing never prints private keys.
- 🖥️ **Interactive TUI**: pick tasks, wallet range, concurrency, dry-run, and dashboard mode.
- 🌐 **Web dashboard**: realtime mobile-friendly dashboard from `logs/status.json`.
- 📊 **CLI live dashboard**: wallet index, address, task, status, tx hash, balance, and proxy route.
- 🔁 **Resume failed/manual tasks**: retry only tasks that need attention.
- 🧪 **Dry-run mode**: preview actions without broadcasting transactions.
- 🧩 **Ecosystem modules**: Arkada, Lester, MidasHand, ZNS, InfinityName, and Sweep.
- 🛰️ **DataImpulse-aware proxy routing**: `gw.dataimpulse.com:823` can map wallets to sticky ports.
- 🧯 **Local-friendly throttling**: separate wallet concurrency and browser concurrency.

## 🧭 Task Flow

`npm run bot -- ecosystem` runs the full flow in this order:

| Step | Module | What It Does |
| --- | --- | --- |
| 1 | 🚰 LitVM Faucet | Opens LitVM portal, connects wallet, adds LiteForge, requests zkLTC, waits for balance. |
| 2 | 👋 OnChainGM | Runs daily GM on LitVM when available. |
| 3 | 🧱 Deploy GM | Uses the deploy-contract flow from OnChainGM. |
| 4 | 🏹 Arkada | Connects wallet and verifies LitVM wallet. |
| 5 | 🧪 Lester | Creates a test token on LiteForge. |
| 6 | 🖐️ MidasHand | Daily claim, rewards/quests, USDC faucet, and market activity flow. |
| 7 | 🌐 ZNS | Runs LiteForge deploy-all style domain flow. |
| 8 | ♾️ InfinityName | Registers a LitVM testnet domain label. |
| 9 | 🧹 Sweep | Mints NFTs one-by-one, capped by `SWEEP_MINT_COUNT`. |

Badge minting on `onchaingm.com/badge-litvm` is intentionally excluded because it is not part of the required task set.

## 🚀 Quick Start

```bash
git clone https://github.com/0xprune/litvm-bot.git
cd litvm-bot
npm install
cp .env.example .env
npm run install:browsers
```

Edit `.env`, then verify your derived wallet addresses:

```bash
npm run bot -- wallets --env-file .env
```

Run the interactive menu:

```bash
npm run bot -- menu --env-file .env
```

## ⚙️ Configuration

Minimum `.env` values:

```env
MNEMONIC="test test test test test test test test test test test junk"
LITVM_RPC=https://liteforge.rpc.caldera.xyz/http
CHAIN_ID=4441
WALLET_START_INDEX=0
WALLET_COUNT=10
CONCURRENCY=5
BROWSER_CONCURRENCY=2
```

Recommended local-friendly settings:

```env
DELAY_MIN_MS=45000
DELAY_MAX_MS=120000
FAUCET_WAIT_TIMEOUT_MS=180000
FAUCET_POLL_INTERVAL_MS=5000
BROWSER_HEADLESS=true
DASHBOARD_RESOLVE_PROXY_IP=false
SWEEP_MINT_COUNT=1
```

For heavier production-style runs, increase gradually:

```env
WALLET_COUNT=25
CONCURRENCY=5
BROWSER_CONCURRENCY=2
SWEEP_MINT_COUNT=5
```

## 🕹️ Commands

| Command | Purpose |
| --- | --- |
| `npm run bot -- menu --env-file .env` | Open interactive TUI. |
| `npm run bot -- wallets --env-file .env` | Show derived addresses only. |
| `npm run bot -- balance --env-file .env` | Check zkLTC balances. |
| `npm run bot -- faucet --env-file .env` | Run faucet flow only. |
| `npm run bot -- ecosystem --env-file .env` | Run full LitVM flow. |
| `npm run bot -- proxy-check --env-file .env` | Check proxy connectivity. |
| `npm run bot -- web-dashboard --env-file .env` | Serve local web dashboard. |

Dry-run example:

```bash
npm run bot -- ecosystem --dry-run --env-file .env
```

Local balanced run:

```bash
npm run bot -- ecosystem \
  --dashboard \
  --env-file .env \
  --wallet-count 10 \
  --concurrency 5 \
  --browser-concurrency 2
```

Ultra-light laptop run:

```bash
npm run bot -- ecosystem \
  --dashboard \
  --env-file .env \
  --wallet-count 5 \
  --concurrency 3 \
  --browser-concurrency 1
```

## 📺 Dashboard

The bot writes realtime status to:

```text
logs/status.json
```

Start the web dashboard:

```bash
npm run bot -- web-dashboard --env-file .env
```

Default URL:

```text
http://127.0.0.1:8787
```

Dashboard includes:

- 🧾 wallet index and address
- 🌐 proxy route / optional exit IP
- 💰 zkLTC balance
- 🧩 current task
- ✅ status counters
- 🔗 transaction hash
- 🧯 error/manual handoff reason

## 🛰️ Proxy Setup

Proxy is optional, but supported for browser connectivity and session isolation.

```env
BROWSER_PROXY_SERVER=http://host:port
BROWSER_PROXY_POOL=http://backup-a:port,http://backup-b:port
BROWSER_PROXY_USERNAME=username
BROWSER_PROXY_PASSWORD=password
BROWSER_PROXY_MODE=sticky-wallet
BROWSER_PROXY_REQUIRE_UNIQUE=false
BROWSER_PROXY_DIRECT_FALLBACK=false
BROWSER_CONCURRENCY=2
DASHBOARD_RESOLVE_PROXY_IP=false
```

### DataImpulse Note

DataImpulse uses:

- 🔄 `823` / `824` for rotating HTTP/HTTPS gateway.
- 📌 `10000-20000` for sticky session ports.

If you configure:

```env
BROWSER_PROXY_SERVER=http://gw.dataimpulse.com:823
```

the bot automatically maps wallets like this:

| Wallet Index | Proxy Route |
| --- | --- |
| `0` | `gw.dataimpulse.com:10000` |
| `1` | `gw.dataimpulse.com:10001` |
| `24` | `gw.dataimpulse.com:10024` |

Live exit-IP checks are disabled by default because they launch extra browser sessions. Enable only when needed:

```bash
npm run bot -- ecosystem --dashboard --resolve-proxy-ip --env-file .env
```

## 🔐 Wallet Backup

The TUI can export:

```text
address | privateKey
0x... | 0x...
```

Exports are written to `exports/`, which is ignored by git.

> 🚨 Private keys are sensitive. Keep exported files offline and delete them when no longer needed.

## 🧪 Testing

```bash
npm run typecheck
npm test
npm run build
```

## 🧯 Troubleshooting

### Playwright says browser executable does not exist

Install the Chromium browser binary before running real browser tasks:

```bash
npm run install:browsers
```

On Linux/VPS, install system dependencies too:

```bash
npm run install:browsers:with-deps
```

If this step is missing, faucet/browser tasks cannot open the website and the bot will stop that wallet before GM/ecosystem tasks.

### Balance stays `0.0000 zkLTC`

The faucet step must fund the wallet before the bot continues. If the faucet requires verification, the bot marks the wallet as `manual` and skips GM/ecosystem tasks for that wallet.

### Local machine feels heavy

Lower browser pressure:

```bash
npm run bot -- ecosystem --dashboard --env-file .env \
  --wallet-count 5 \
  --concurrency 3 \
  --browser-concurrency 1
```

Also set:

```env
SWEEP_MINT_COUNT=1
DASHBOARD_RESOLVE_PROXY_IP=false
```

### Too many wallets are pending

Increase wallet concurrency carefully:

```bash
--concurrency 5
```

Keep browser concurrency lower:

```bash
--browser-concurrency 2
```

### Proxy IP does not show in dashboard

That is intentional for performance. The dashboard shows `not checked` unless you enable:

```env
DASHBOARD_RESOLVE_PROXY_IP=true
```

or pass:

```bash
--resolve-proxy-ip
```

## 🧱 Project Structure

```text
src/
  cli.ts              # CLI commands
  tui.ts              # Interactive terminal menu
  runner.ts           # Task runner and throttling
  dashboard.ts        # CLI dashboard + status JSON
  web-dashboard.ts    # Local realtime web dashboard
  proxy.ts            # Proxy parsing and sticky wallet assignment
  wallets.ts          # Mnemonic derivation and backup export
  tasks/
    litvm.ts          # Faucet, GM, deploy-GM
    ecosystem.ts      # Arkada, Lester, MidasHand, ZNS, InfinityName, Sweep
    browser.ts        # Playwright wallet provider automation
tests/                # Vitest coverage
```

## 🛡️ Safety Notes

- ✅ Testnet-only automation.
- ✅ Private keys are never printed by default.
- ✅ `.env`, `logs/`, `exports/`, `dist/`, and `node_modules/` are ignored.
- ✅ CAPTCHA, rate limits, and verification gates are not bypassed.
- ✅ Faucet funding is verified by balance before later tasks continue.

## ❤️ Credits

Made with ❤️ by [Prune](https://x.com/itsprune).
