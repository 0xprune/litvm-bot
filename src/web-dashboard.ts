import { readFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { BotConfig } from "./config.js";
import type { DashboardStatus } from "./dashboard.js";

export type WebDashboardServer = {
  url: string;
  close(): Promise<void>;
};

export async function startWebDashboard(config: Pick<BotConfig, "STATUS_FILE" | "DASHBOARD_HOST" | "DASHBOARD_PORT">): Promise<WebDashboardServer> {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        sendText(response, 405, "Method not allowed");
        return;
      }

      if (url.pathname === "/") {
        sendHtml(response, webDashboardHtml());
        return;
      }

      if (url.pathname === "/api/status") {
        sendJson(response, await readStatusFile(config.STATUS_FILE));
        return;
      }

      sendText(response, 404, "Not found");
    } catch (error) {
      sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.DASHBOARD_PORT, config.DASHBOARD_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const host = address.address === "::" ? "localhost" : address.address;

  return {
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

export async function readStatusFile(statusFile: string): Promise<DashboardStatus | { ready: false; message: string }> {
  try {
    return JSON.parse(await readFile(statusFile, "utf8")) as DashboardStatus;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        ready: false,
        message: `Status file not found: ${statusFile}`
      };
    }
    throw error;
  }
}

export function webDashboardHtml(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LitVM Bot Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef3f8;
      --surface: #ffffff;
      --surface-2: #f8fafc;
      --ink: #101828;
      --muted: #667085;
      --line: #d9e1ea;
      --line-strong: #b7c3d1;
      --blue: #2563eb;
      --cyan: #0891b2;
      --green: #168a4a;
      --amber: #b76e00;
      --red: #c2413a;
      --violet: #6d28d9;
      --shadow: 0 18px 45px rgba(16, 24, 40, 0.10);
      --radius: 8px;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, #f8fbff 0%, var(--bg) 46%, #e7edf5 100%);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    button, input, select { font: inherit; letter-spacing: 0; }
    .shell { min-height: 100vh; display: flex; flex-direction: column; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      min-height: 72px;
      padding: 14px clamp(14px, 3vw, 28px);
      background: rgba(255, 255, 255, 0.92);
      border-bottom: 1px solid rgba(183, 195, 209, 0.72);
      backdrop-filter: blur(14px);
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      color: #fff;
      font-weight: 800;
      background: #101828;
      box-shadow: 0 10px 28px rgba(16, 24, 40, 0.22);
      flex: 0 0 auto;
    }
    h1 { margin: 0; font-size: clamp(20px, 3vw, 30px); line-height: 1.05; }
    .subtitle { margin-top: 4px; color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .live-cluster { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
    .live-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      font-weight: 700;
      font-size: 13px;
    }
    .dot { width: 9px; height: 9px; border-radius: 99px; background: #98a2b3; }
    .dot.live { background: var(--green); box-shadow: 0 0 0 5px rgba(22, 138, 74, 0.12); }
    .dot.paused { background: var(--amber); box-shadow: 0 0 0 5px rgba(183, 110, 0, 0.12); }
    .btn {
      height: 34px;
      border: 1px solid var(--line-strong);
      background: #fff;
      color: #344054;
      border-radius: 7px;
      padding: 0 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn:hover { border-color: var(--blue); color: var(--blue); }
    main {
      width: min(1480px, 100%);
      margin: 0 auto;
      padding: clamp(14px, 3vw, 28px);
      display: grid;
      gap: 16px;
      flex: 1;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr);
      gap: 14px;
      align-items: start;
    }
    .overview, .control-panel, .metric, .data-panel, .mobile-card {
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(183, 195, 209, 0.82);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .overview { padding: 18px; display: grid; gap: 18px; align-content: start; }
    .summary-line { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .summary-title { font-size: clamp(19px, 3vw, 28px); font-weight: 800; line-height: 1.08; }
    .summary-meta { color: var(--muted); font-size: 13px; margin-top: 6px; }
    .mode-chip {
      display: inline-flex;
      align-items: center;
      height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      background: #eef2ff;
      color: var(--violet);
      border: 1px solid #d7dafe;
      font-weight: 800;
      font-size: 12px;
      white-space: nowrap;
    }
    .progress-track {
      height: 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #e7edf5;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, var(--blue), var(--cyan), var(--green));
      transition: width 220ms ease;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
    }
    .metric { padding: 13px; min-height: 78px; box-shadow: none; }
    .metric-label { color: var(--muted); font-size: 12px; font-weight: 700; }
    .metric-value { margin-top: 8px; font-size: clamp(20px, 2.2vw, 30px); font-weight: 850; line-height: 1; }
    .control-panel { padding: 14px; display: grid; gap: 12px; box-shadow: none; }
    .control-title { font-weight: 850; }
    .control-grid { display: grid; gap: 10px; }
    .field { display: grid; gap: 6px; }
    label { color: var(--muted); font-size: 12px; font-weight: 800; }
    .search, .select {
      width: 100%;
      height: 40px;
      border-radius: 7px;
      border: 1px solid var(--line-strong);
      background: #fff;
      color: var(--ink);
      padding: 0 12px;
      outline: none;
    }
    .search:focus, .select:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14); }
    .segments { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .seg {
      height: 34px;
      border-radius: 7px;
      border: 1px solid var(--line);
      background: var(--surface-2);
      color: #344054;
      cursor: pointer;
      font-size: 12px;
      font-weight: 800;
    }
    .seg.active { background: #101828; color: #fff; border-color: #101828; }
    .data-panel { overflow: hidden; }
    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .panel-title { font-size: 16px; font-weight: 850; }
    .panel-sub { color: var(--muted); font-size: 12px; margin-top: 3px; }
    .table-wrap { overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 1040px; font-size: 13px; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
    th { position: sticky; top: 0; background: #f8fafc; color: #475467; font-size: 12px; font-weight: 850; z-index: 1; }
    tbody tr:hover { background: #f9fbff; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
    .muted { color: var(--muted); }
    .status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 78px;
      height: 26px;
      border-radius: 999px;
      border: 1px solid currentColor;
      font-size: 12px;
      font-weight: 850;
      text-transform: capitalize;
    }
    .success { color: var(--green); background: rgba(22, 138, 74, 0.08); }
    .failed { color: var(--red); background: rgba(194, 65, 58, 0.08); }
    .manual { color: var(--amber); background: rgba(183, 110, 0, 0.09); }
    .running { color: var(--blue); background: rgba(37, 99, 235, 0.09); }
    .pending { color: #64748b; background: rgba(100, 116, 139, 0.09); }
    .skipped, .dry-run, .done { color: #475467; background: rgba(71, 84, 103, 0.08); }
    .error-cell { max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--red); }
    .mobile-list { display: none; padding: 12px; gap: 10px; }
    .mobile-card { padding: 13px; box-shadow: none; display: grid; gap: 12px; }
    .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .card-address { font-weight: 850; }
    .kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .kv-item { border: 1px solid var(--line); border-radius: 7px; padding: 8px; background: var(--surface-2); min-width: 0; }
    .kv-label { font-size: 11px; color: var(--muted); font-weight: 800; margin-bottom: 5px; }
    .kv-value { font-size: 13px; overflow-wrap: anywhere; }
    .empty {
      margin: 14px;
      padding: 36px 16px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--line-strong);
      border-radius: var(--radius);
      background: var(--surface-2);
    }
    footer {
      padding: 18px 16px 28px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
    footer a { color: var(--blue); font-weight: 850; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    @media (max-width: 1080px) {
      .hero { grid-template-columns: 1fr; }
      .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .segments { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      .topbar { position: static; align-items: flex-start; flex-direction: column; }
      .brand { width: 100%; }
      .live-cluster { width: 100%; justify-content: space-between; }
      .subtitle { white-space: normal; }
      main { padding: 10px; gap: 10px; }
      .overview, .control-panel, .data-panel { border-radius: 8px; }
      .summary-line { flex-direction: column; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .metric { min-height: 70px; }
      .segments { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .panel-head { align-items: flex-start; flex-direction: column; }
      .table-wrap { display: none; }
      .mobile-list { display: grid; }
      .kv { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="mark">LV</div>
        <div>
          <h1>LitVM Bot Dashboard</h1>
          <div class="subtitle" id="run-meta">Waiting for status file</div>
        </div>
      </div>
      <div class="live-cluster">
        <div class="live-pill"><span id="dot" class="dot"></span><span id="poll-state">Connecting</span></div>
        <button class="btn" id="refresh-now" type="button">Refresh</button>
        <button class="btn" id="pause-toggle" type="button">Pause</button>
      </div>
    </header>
    <main>
      <section class="hero">
        <div class="overview">
          <div class="summary-line">
            <div>
              <div class="summary-title" id="summary-title">No active run</div>
              <div class="summary-meta" id="summary-meta">Start a bot run with --dashboard to stream live status here.</div>
            </div>
            <div class="mode-chip" id="mode-chip">proxy: -</div>
          </div>
          <div class="progress-track"><div class="progress-fill" id="progress-bar"></div></div>
          <div class="metrics">
            <div class="metric"><div class="metric-label">Wallets</div><div class="metric-value" id="wallets">-</div></div>
            <div class="metric"><div class="metric-label">Progress</div><div class="metric-value" id="progress-text">-</div></div>
            <div class="metric"><div class="metric-label">Success</div><div class="metric-value success" id="success">0</div></div>
            <div class="metric"><div class="metric-label">Manual</div><div class="metric-value manual" id="manual">0</div></div>
            <div class="metric"><div class="metric-label">Failed</div><div class="metric-value failed" id="failed">0</div></div>
            <div class="metric"><div class="metric-label">Dry-run</div><div class="metric-value dry-run" id="dryrun">0</div></div>
          </div>
        </div>
        <aside class="control-panel">
          <div>
            <div class="control-title">Controls</div>
            <div class="panel-sub" id="last-sync">Last sync: -</div>
          </div>
          <div class="control-grid">
            <div class="field">
              <label for="search">Search</label>
              <input id="search" class="search" type="search" placeholder="wallet, proxy IP, task, status">
            </div>
            <div class="field">
              <label>Status Filter</label>
              <div class="segments" id="segments">
                <button type="button" class="seg active" data-filter="all">All</button>
                <button type="button" class="seg" data-filter="running">Running</button>
                <button type="button" class="seg" data-filter="success">Success</button>
                <button type="button" class="seg" data-filter="manual">Manual</button>
                <button type="button" class="seg" data-filter="failed">Failed</button>
                <button type="button" class="seg" data-filter="dry-run">Dry-run</button>
              </div>
            </div>
            <div class="field">
              <label for="interval">Refresh Rate</label>
              <select id="interval" class="select">
                <option value="500">0.5s</option>
                <option value="1000" selected>1s</option>
                <option value="2000">2s</option>
                <option value="5000">5s</option>
              </select>
            </div>
          </div>
        </aside>
      </section>
      <section class="data-panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">Wallet Activity</div>
            <div class="panel-sub" id="rows-meta">0 wallets visible</div>
          </div>
          <div class="panel-sub" id="status-file">Status file: logs/status.json</div>
        </div>
        <div id="table" class="table-wrap"></div>
        <div id="cards" class="mobile-list"></div>
      </section>
    </main>
    <footer>Made with ❤️ by <a href="https://x.com/itsprune" target="_blank" rel="noreferrer">Prune</a></footer>
  </div>
  <script>
    const app = {
      status: null,
      filter: "all",
      query: "",
      paused: false,
      timer: null,
      interval: 1000
    };
    const el = (id) => document.getElementById(id);
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const short = (value) => {
      const text = String(value ?? "-");
      return text.length > 20 ? text.slice(0, 8) + "..." + text.slice(-6) : text;
    };
    const normalize = (value) => String(value ?? "").toLowerCase();
    const statusClass = (value) => normalize(value).replace(/[^a-z0-9-]/g, "") || "pending";
    const age = (iso) => {
      if (!iso) return "-";
      const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
      if (seconds < 60) return seconds + "s ago";
      const minutes = Math.round(seconds / 60);
      return minutes + "m ago";
    };
    function filteredRows() {
      const rows = app.status?.rows ?? [];
      return rows.filter((row) => {
        const statusOk = app.filter === "all" || normalize(row.status) === app.filter;
        const haystack = normalize([row.walletIndex, row.address, row.proxyIp, row.proxy, row.balance, row.currentTask, row.status, row.txHash, row.error].join(" "));
        return statusOk && haystack.includes(app.query);
      });
    }
    function setConnection(kind, text) {
      el("dot").className = "dot " + kind;
      el("poll-state").textContent = text;
    }
    function render(status) {
      app.status = status;
      if (app.paused) setConnection("paused", "Paused");
      else setConnection("live", "Live");
      if (status.ready === false) {
        el("summary-title").textContent = "Waiting for bot status";
        el("summary-meta").textContent = status.message;
        el("table").innerHTML = '<div class="empty">' + esc(status.message) + '</div>';
        el("cards").innerHTML = '<div class="empty">' + esc(status.message) + '</div>';
        return;
      }
      const total = status.totalActions || 0;
      const done = status.completedActions || 0;
      const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      el("wallets").textContent = status.walletCount ?? "-";
      el("progress-text").textContent = done + " / " + total;
      el("progress-bar").style.width = pct + "%";
      el("success").textContent = status.counters?.success ?? 0;
      el("manual").textContent = status.counters?.manual ?? 0;
      el("failed").textContent = status.counters?.failed ?? 0;
      el("dryrun").textContent = status.counters?.["dry-run"] ?? 0;
      el("summary-title").textContent = pct + "% complete";
      el("summary-meta").textContent = "Tasks: " + (status.tasks ?? []).join(", ") + " | Updated " + age(status.updatedAt);
      el("run-meta").textContent = "Wallets " + (status.walletCount ?? 0) + " | " + (status.tasks ?? []).join(", ");
      el("mode-chip").textContent = "proxy: " + (status.proxyMode ?? "-");
      el("last-sync").textContent = "Last sync: " + age(status.updatedAt);
      renderRows();
    }
    function renderRows() {
      const rows = filteredRows();
      el("rows-meta").textContent = rows.length + " wallet" + (rows.length === 1 ? "" : "s") + " visible";
      el("status-file").textContent = "Status file: logs/status.json";
      if (!rows.length) {
        el("table").innerHTML = '<div class="empty">No wallets match the current filter.</div>';
        el("cards").innerHTML = '<div class="empty">No wallets match the current filter.</div>';
        return;
      }
      el("table").innerHTML =
        '<table><thead><tr><th>Idx</th><th>Address</th><th>Proxy/IP</th><th>Balance</th><th>Task</th><th>Status</th><th>Tx</th><th>Error</th></tr></thead><tbody>' +
        rows.map((row) =>
          '<tr>' +
          '<td>' + esc(row.walletIndex) + '</td>' +
          '<td class="mono" title="' + esc(row.address) + '">' + esc(short(row.address)) + '</td>' +
          '<td><div class="mono">' + esc(row.proxyIp || "-") + '</div><div class="muted">' + esc(row.proxy || "-") + '</div></td>' +
          '<td>' + esc(row.balance || "-") + '</td>' +
          '<td>' + esc(row.currentTask || "-") + '</td>' +
          '<td><span class="status ' + esc(statusClass(row.status)) + '">' + esc(row.status || "pending") + '</span></td>' +
          '<td class="mono" title="' + esc(row.txHash || "-") + '">' + esc(short(row.txHash || "-")) + '</td>' +
          '<td class="error-cell" title="' + esc(row.error || "") + '">' + esc(row.error || "") + '</td>' +
          '</tr>'
        ).join("") + '</tbody></table>';
      el("cards").innerHTML = rows.map((row) =>
        '<article class="mobile-card">' +
          '<div class="card-top"><div><div class="muted">Wallet ' + esc(row.walletIndex) + '</div><div class="card-address mono">' + esc(short(row.address)) + '</div></div><span class="status ' + esc(statusClass(row.status)) + '">' + esc(row.status || "pending") + '</span></div>' +
          '<div class="kv">' +
            '<div class="kv-item"><div class="kv-label">Proxy IP</div><div class="kv-value mono">' + esc(row.proxyIp || "-") + '</div></div>' +
            '<div class="kv-item"><div class="kv-label">Balance</div><div class="kv-value">' + esc(row.balance || "-") + '</div></div>' +
            '<div class="kv-item"><div class="kv-label">Task</div><div class="kv-value">' + esc(row.currentTask || "-") + '</div></div>' +
            '<div class="kv-item"><div class="kv-label">Tx</div><div class="kv-value mono">' + esc(short(row.txHash || "-")) + '</div></div>' +
          '</div>' +
          (row.error ? '<div class="error-cell">' + esc(row.error) + '</div>' : '') +
        '</article>'
      ).join("");
    }
    async function poll() {
      if (app.paused) return;
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        render(await response.json());
      } catch (error) {
        setConnection("", "Disconnected");
      }
    }
    function restartTimer() {
      if (app.timer) clearInterval(app.timer);
      app.timer = setInterval(poll, app.interval);
    }
    el("search").addEventListener("input", (event) => {
      app.query = normalize(event.target.value);
      renderRows();
    });
    el("segments").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-filter]");
      if (!button) return;
      app.filter = button.dataset.filter;
      Array.from(document.querySelectorAll(".seg")).forEach((item) => item.classList.toggle("active", item === button));
      renderRows();
    });
    el("pause-toggle").addEventListener("click", () => {
      app.paused = !app.paused;
      el("pause-toggle").textContent = app.paused ? "Resume" : "Pause";
      setConnection(app.paused ? "paused" : "live", app.paused ? "Paused" : "Live");
      if (!app.paused) poll();
    });
    el("refresh-now").addEventListener("click", poll);
    el("interval").addEventListener("change", (event) => {
      app.interval = Number(event.target.value);
      restartTimer();
    });
    poll();
    restartTimer();
  </script>
</body>
</html>`;
}

function sendHtml(response: http.ServerResponse, body: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(response.req.method === "HEAD" ? undefined : body);
}

function sendJson(response: http.ServerResponse, body: unknown, statusCode = 200): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(response.req.method === "HEAD" ? undefined : JSON.stringify(body));
}

function sendText(response: http.ServerResponse, statusCode: number, body: string): void {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(response.req.method === "HEAD" ? undefined : body);
}
