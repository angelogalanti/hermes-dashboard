/**
 * Snapshot equity — standalone script.
 * Chiama Hyperliquid clearinghouseState e salva equity + timestamp in SQLite.
 * Usato dal cron Hermes ogni 5 min.
 *
 * Esegue senza dipendere dal server Next.js.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(process.cwd(), "data", "equity.db");
const HL_API = "https://api.hyperliquid.xyz/info";
const USER = "0xB9b7A899C2A6E6BDcc0B87BA2148C1dF046A07e9";

async function snapshot() {
  // Carica DB
  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS snapshots (ts INTEGER PRIMARY KEY, equity REAL NOT NULL)`);

  // Chiamata HL
  const [perpRes, spotRes] = await Promise.all([
    fetch(HL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: USER }),
    }),
    fetch(HL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotClearinghouseState", user: USER }),
    }),
  ]);
  const perpData = await perpRes.json();
  const spotData = await spotRes.json();

  const perpAv = parseFloat(perpData.marginSummary?.accountValue || "0");
  const perpUpnl = (perpData.assetPositions ?? []).reduce((sum, p) => {
    const pos = p.position ?? p;
    return sum + parseFloat(pos.unrealizedPnl || "0");
  }, 0);
  const spotUsdc = (spotData.balances ?? [])
    .filter((b) => b.coin === "USDC")
    .reduce((sum, b) => sum + parseFloat(b.total || "0"), 0);

  const equity = Math.max(perpAv, spotUsdc + perpUpnl);
  const ts = Math.floor(Date.now() / 1000);

  // Salva
  db.run("INSERT OR REPLACE INTO snapshots (ts, equity) VALUES (?, ?)", [ts, equity]);

  const buffer = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buffer);
  db.close();

  const now = new Date().toISOString();
  console.log(`[${now}] Snapshot salvato: equity=${equity.toFixed(4)} ts=${ts}`);
}

snapshot().catch((err) => {
  console.error("Snapshot error:", err.message);
  process.exit(1);
});
