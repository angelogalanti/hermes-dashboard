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
 * Walk fills chronologically to reconstruct equity curve and compute
 * peak equity / max drawdown % from the fill history alone.
 */
function drawdownFromFills(
  fills: Fill[],
  currentEquity: number,
): { peakEquity: number; maxDrawdownPct: number } {
  const sorted = [...fills].sort((a, b) => a.time - b.time);
  const totalPnl = sorted.reduce((s, f) => s + parseFloat(f.closedPnl || "0"), 0);
  let equity = currentEquity - totalPnl;
  let peak = equity;
  let maxDd = 0;

  for (const f of sorted) {
    equity += parseFloat(f.closedPnl || "0");
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  return { peakEquity: peak, maxDrawdownPct: maxDd * 100 };
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
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [accRes, fillsRes] = await Promise.all([
        fetch("/api/account"),
        fetch("/api/fills"),
      ]);
      if (!accRes.ok || !fillsRes.ok) {
        throw new Error(`API error: account=${accRes.status} fills=${fillsRes.status}`);
      }
      setAccount(await accRes.json());
      setFills(await fillsRes.json());
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
  const { peakEquity, maxDrawdownPct } = drawdownFromFills(fills, equity);
  const totalPositionValue = (account?.assetPositions ?? []).reduce(
    (s, p) => s + parseFloat(p.positionValue || "0"),
    0,
  );
  const positions = account?.assetPositions ?? [];

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

        {/* ---- RIGHT: positions table ---- */}
        <div className="lg:col-span-2">
          <Card className="p-0 overflow-hidden">
            {/* table header */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-3 text-slate-300 text-sm font-medium border-b border-slate-700/40">
              <i className="fas fa-layer-group" />
              <span>Posizioni Aperte</span>
              <span className="text-slate-500 text-xs ml-auto">
                {positions.length} posizione{positions.length !== 1 ? "s" : ""}
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
        </div>
      </div>
    </main>
  );
}
