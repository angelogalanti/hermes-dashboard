"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
}

interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  fee: string;
  closedPnl: string;
  time: number;
}

interface AccountData {
  accountValue: string;
  assetPositions: Position[];
}

interface EquitySnapshot {
  time: number;
  equity: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Sum closedPnl from fills in the last N ms. */
function sumClosedPnl(fills: Fill[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return fills.reduce((sum, f) => {
    if (f.time >= cutoff && f.closedPnl) return sum + parseFloat(f.closedPnl);
    return sum;
  }, 0);
}

/**
 * Walk database snapshots chronologically and compute peak equity and max drawdown %.
 */
function drawdownFromHistory(
  history: EquitySnapshot[],
  currentEquity: number,
): { peakEquity: number; maxDrawdownPct: number } {
  if (history.length === 0) {
    return { peakEquity: currentEquity, maxDrawdownPct: 0 };
  }

  // Combine database history with the current live equity point
  const points = [...history];
  if (currentEquity > 0) {
    points.push({ time: Date.now(), equity: currentEquity });
  }

  let peak = -Infinity;
  let maxDd = 0;

  for (const p of points) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? (peak - p.equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  return { peakEquity: peak > -Infinity ? peak : 0, maxDrawdownPct: maxDd * 100 };
}

/* ------------------------------------------------------------------ */
/*  Small reusable components                                         */
/* ------------------------------------------------------------------ */

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-slate-700/50 bg-slate-800/60 p-5 shadow-lg shadow-black/10 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
        <i className={`fas fa-${icon}`} />
        <span>{label}</span>
      </div>
      <p className={`text-3xl font-semibold ${valueColor ?? "text-slate-100"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main dashboard                                                     */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [fills, setFills] = useState<Fill[]>([]);
  const [history, setHistory] = useState<EquitySnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab2026, setActiveTab2026] = useState<"coins" | "fills">("coins");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [accRes, fillsRes, historyRes] = await Promise.all([
        fetch("/api/account"),
        fetch("/api/fills"),
        fetch("/api/history"),
      ]);
      if (!accRes.ok || !fillsRes.ok || !historyRes.ok) {
        throw new Error(`API error: account=${accRes.status} fills=${fillsRes.status} history=${historyRes.status}`);
      }
      setAccount(await accRes.json());
      setFills(await fillsRes.json());
      setHistory(await historyRes.json());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  /* ---- derived metrics ---- */
  const equity = account ? parseFloat(account.accountValue) : 0;
  const pnl24h = sumClosedPnl(fills, 24 * 60 * 60 * 1000);
  const { peakEquity, maxDrawdownPct } = drawdownFromHistory(history, equity);
  const totalPositionValue = (account?.assetPositions ?? []).reduce(
    (s, p) => s + parseFloat(p.positionValue || "0"),
    0,
  );
  const positions = account?.assetPositions ?? [];

  // Filter 2026 fills
  const START_OF_2026_MS = 1767225600000; // 2026-01-01T00:00:00Z
  const fills2026 = fills.filter((f) => f.time >= START_OF_2026_MS);

  // Summary statistics for 2026
  const totalRealizedPnl2026 = fills2026.reduce(
    (sum, f) => sum + parseFloat(f.closedPnl || "0"),
    0
  );
  const totalFees2026 = fills2026.reduce(
    (sum, f) => sum + parseFloat(f.fee || "0"),
    0
  );
  const totalTrades2026 = fills2026.length;

  // Group by coin for the coin-level summary
  interface CoinSummary {
    coin: string;
    realizedPnl: number;
    fee: number;
    trades: number;
  }

  const coinSummaries = Object.values(
    fills2026.reduce<Record<string, CoinSummary>>((acc, f) => {
      if (!acc[f.coin]) {
        acc[f.coin] = {
          coin: f.coin,
          realizedPnl: 0,
          fee: 0,
          trades: 0,
        };
      }
      acc[f.coin].realizedPnl += parseFloat(f.closedPnl || "0");
      acc[f.coin].fee += parseFloat(f.fee || "0");
      acc[f.coin].trades += 1;
      return acc;
    }, {})
  );

  return (
    <main className="p-6 max-w-7xl mx-auto min-h-screen">
      {/* header */}
      <div className="flex items-center gap-3 mb-6">
        <i className="fas fa-chart-line text-indigo-400 text-2xl" />
        <h1 className="text-2xl font-bold text-slate-100">Trading Dashboard</h1>
        {error && (
          <span className="ml-auto text-xs text-red-400">
            <i className="fas fa-triangle-exclamation mr-1" />
            {error}
          </span>
        )}
      </div>

      {/* two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- LEFT: metric cards ---- */}
        <div className="lg:col-span-1 space-y-4">
          <MetricCard
            icon="wallet"
            label="Equity"
            value={`$${fmt(equity)}`}
          />

          <MetricCard
            icon="clock"
            label="P/L 24h"
            value={`${pnl24h >= 0 ? "+" : ""}$${fmt(pnl24h)}`}
            valueColor={pnl24h >= 0 ? "text-emerald-400" : "text-red-400"}
          />

          <MetricCard
            icon="arrow-trend-down"
            label="Max Drawdown"
            value={`${maxDrawdownPct > 0 ? "-" : ""}${maxDrawdownPct.toFixed(2)}%`}
            valueColor="text-red-400"
            sub={`Peak: $${fmt(peakEquity)}`}
          />
        </div>

        {/* ---- RIGHT: positions table & closed positions summary ---- */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 overflow-hidden">
            {/* table header */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-3 text-slate-300 text-sm font-medium border-b border-slate-700/40">
              <i className="fas fa-layer-group" />
              <span>Posizioni Aperte</span>
              <span className="text-slate-500 text-xs ml-auto">
                {positions.length} posizione/i
              </span>
            </div>

            {positions.length === 0 ? (
              <div className="px-5 py-8 text-slate-500 text-sm text-center">
                {account ? (
                  <>
                    <i className="fas fa-ban mr-2" />
                    Nessuna posizione aperta
                  </>
                ) : (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2" />
                    Loading...
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/40">
                      <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Coin
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Size
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Notional $
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Entry
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Unreal. P/L
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        % Book
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const szi = parseFloat(p.szi);
                      const pv = parseFloat(p.positionValue || "0");
                      const upnl = parseFloat(p.unrealizedPnl || "0");
                      const entryPx = parseFloat(p.entryPx || "0");
                      const bookPct =
                        totalPositionValue > 0
                          ? (pv / totalPositionValue) * 100
                          : 0;

                      return (
                        <tr
                          key={p.coin}
                          className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors"
                        >
                          <td className="font-medium text-slate-200 px-5 py-3">
                            {p.coin}
                          </td>
                          <td
                            className={`text-right font-mono px-5 py-3 ${
                              szi >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            <i
                              className={`fas fa-arrow-${
                                szi >= 0 ? "up" : "down"
                              } mr-1 text-[10px]`}
                            />
                            {szi >= 0 ? "+" : ""}
                            {fmt(szi)}
                          </td>
                          <td className="text-right font-mono text-slate-300 px-5 py-3">
                            ${fmt(pv)}
                          </td>
                          <td className="text-right font-mono text-slate-300 px-5 py-3">
                            ${fmt(entryPx)}
                          </td>
                          <td
                            className={`text-right font-mono px-5 py-3 ${
                              upnl >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {upnl >= 0 ? "+" : ""}${fmt(upnl)}
                          </td>
                          <td className="text-right font-mono text-slate-400 px-5 py-3">
                            {bookPct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ---- CLOSED POSITIONS SUMMARY (2026+) ---- */}
          <Card className="p-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-3 text-slate-300 text-sm font-medium border-b border-slate-700/40 bg-slate-800/40">
              <i className="fas fa-box-archive text-indigo-400" />
              <span>Sintesi Posizioni Chiuse (dal 2026)</span>
              <span className="text-slate-500 text-xs ml-auto">
                {fills2026.length} eseguito/i
              </span>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 border-b border-slate-700/20 bg-slate-800/20">
              <div className="px-5 py-4 border-r border-slate-700/20">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">P/L Realizzato</span>
                <span className={`text-lg font-bold font-mono ${totalRealizedPnl2026 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalRealizedPnl2026 >= 0 ? "+" : ""}${fmt(totalRealizedPnl2026)}
                </span>
              </div>
              <div className="px-5 py-4 border-r border-slate-700/20">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Commissioni</span>
                <span className="text-lg font-bold font-mono text-slate-300">
                  ${fmt(totalFees2026)}
                </span>
              </div>
              <div className="px-5 py-4">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Operazioni</span>
                <span className="text-lg font-bold font-mono text-slate-300">
                  {totalTrades2026}
                </span>
              </div>
            </div>

            {/* Tabs Control */}
            <div className="flex border-b border-slate-700/20 text-xs font-semibold px-4 pt-2 bg-slate-800/10">
              <button
                onClick={() => setActiveTab2026("coins")}
                className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                  activeTab2026 === "coins"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Sintesi Coin
              </button>
              <button
                onClick={() => setActiveTab2026("fills")}
                className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                  activeTab2026 === "fills"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Dettaglio Esecuzioni
              </button>
            </div>

            {/* Tab Content */}
            {fills2026.length === 0 ? (
              <div className="px-5 py-8 text-slate-500 text-sm text-center">
                <i className="fas fa-ban mr-2" />
                Nessuna operazione chiusa a partire dal 2026
              </div>
            ) : activeTab2026 === "coins" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/40">
                      <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Coin
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Realized P/L
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Esecuzioni
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Commissioni
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {coinSummaries.map((cs) => (
                      <tr
                        key={cs.coin}
                        className="border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors"
                      >
                        <td className="font-medium text-slate-200 px-5 py-3">
                          {cs.coin}
                        </td>
                        <td
                          className={`text-right font-mono px-5 py-3 ${
                            cs.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {cs.realizedPnl >= 0 ? "+" : ""}${fmt(cs.realizedPnl)}
                        </td>
                        <td className="text-right font-mono text-slate-300 px-5 py-3">
                          {cs.trades}
                        </td>
                        <td className="text-right font-mono text-slate-400 px-5 py-3">
                          ${fmt(cs.fee)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/40">
                      <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Data
                      </th>
                      <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Coin
                      </th>
                      <th className="text-center text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Side
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Prezzo
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Size
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        P/L Chiud.
                      </th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">
                        Fee
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fills2026.map((f, i) => {
                      const fPnl = parseFloat(f.closedPnl || "0");
                      const fSz = parseFloat(f.sz || "0");
                      const fPx = parseFloat(f.px || "0");
                      const fFee = parseFloat(f.fee || "0");
                      const dateStr = new Date(f.time)
                        .toISOString()
                        .replace("T", " ")
                        .substring(0, 19);

                      return (
                        <tr
                          key={i}
                          className="border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors"
                        >
                          <td className="text-slate-400 px-5 py-3 font-mono text-xs">
                            {dateStr}
                          </td>
                          <td className="font-medium text-slate-200 px-5 py-3">
                            {f.coin}
                          </td>
                          <td className="text-center px-5 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                f.side === "B"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-red-500/10 text-red-400"
                              }`}
                            >
                              {f.side === "B" ? "BUY" : "SELL"}
                            </span>
                          </td>
                          <td className="text-right font-mono text-slate-300 px-5 py-3">
                            ${fmt(fPx)}
                          </td>
                          <td className="text-right font-mono text-slate-300 px-5 py-3">
                            {fmt(fSz)}
                          </td>
                          <td
                            className={`text-right font-mono px-5 py-3 ${
                              fPnl > 0
                                ? "text-emerald-400"
                                : fPnl < 0
                                  ? "text-red-400"
                                  : "text-slate-500"
                            }`}
                          >
                            {fPnl > 0 ? "+" : ""}
                            {fPnl !== 0 ? `$${fmt(fPnl)}` : "-"}
                          </td>
                          <td className="text-right font-mono text-slate-400 px-5 py-3">
                            ${fmt(fFee)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
