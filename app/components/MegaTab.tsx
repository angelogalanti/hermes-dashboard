"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type {
  AccountData,
  Fill,
  EquitySnapshot,
  Position,
  CoinSummary,
} from "@/app/lib/types";
import { fmt, sumClosedPnl, buildUnitizedChartSeries } from "@/app/lib/helpers";
import { Card, MetricCard, ChartTooltip } from "@/app/components/ui";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MegaTabProps {
  account: AccountData | null;
  fills: Fill[];
  history: EquitySnapshot[];
  transfers: { time: number; amount: number }[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MegaTab({ account, fills, history, transfers }: MegaTabProps) {
  const [activeTab2026, setActiveTab2026] = useState<"coins" | "fills">("coins");
  const [isClosedExpanded, setIsClosedExpanded] = useState(false);

  /* ---- derived metrics ---- */
  const equity = account ? parseFloat(account.accountValue) : 0;
  const pnl24h = sumClosedPnl(fills, 24 * 60 * 60 * 1000);
  const totalPositionValue = (account?.assetPositions ?? []).reduce(
    (s, p) => s + parseFloat(p.positionValue || "0"),
    0,
  );
  const positions = account?.assetPositions ?? [];

  /* ---- chart series (memoised) ---- */
  const { equitySeries, drawdownSeries } = useMemo(
    () => buildUnitizedChartSeries(history, transfers, equity),
    [history, transfers, equity],
  );

  const peakAbsoluteEquity = useMemo(() => {
    const rawPeak = history.length > 0 ? Math.max(...history.map((h) => h.equity)) : 0;
    return Math.max(rawPeak, equity);
  }, [history, equity]);

  const maxDrawdownPct = useMemo(() => {
    return drawdownSeries.length > 0 ? Math.max(...drawdownSeries.map((d) => -d.drawdown)) : 0;
  }, [drawdownSeries]);

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
    <>
      <div className="space-y-6">
      {/* ---- TOP: metric cards (horizontal) ---- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          sub={`Peak: $${fmt(peakAbsoluteEquity)}`}
        />
      </div>

      {/* ---- MIDDLE: Open Positions Card ---- */}
      <Card className="p-0 overflow-hidden">
        {/* table header */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 text-slate-300 text-sm font-medium border-b border-slate-700/40">
          <i className="fas fa-layer-group text-emerald-405" />
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

      {/* ---- BOTTOM: Expandable Closed Positions Card ---- */}
      <Card className="p-0 overflow-hidden">
        {/* Clickable Header */}
        <div
          onClick={() => setIsClosedExpanded(!isClosedExpanded)}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 cursor-pointer hover:bg-slate-800/10 transition-all select-none border-b border-slate-700/40"
        >
          <div className="flex items-center gap-2 text-slate-300 text-sm font-medium">
            <i className="fas fa-box-archive text-indigo-400" />
            <span>Sintesi Posizioni Chiuse (dal 2026)</span>
            <i className={`fas fa-chevron-${isClosedExpanded ? "up" : "down"} text-xs text-slate-500 ml-1.5`} />
          </div>

          <div className="flex gap-4 text-xs font-mono text-slate-400">
            <span>Operazioni: <strong className="text-slate-200">{totalTrades2026}</strong></span>
            <span>P/L Realizzato: <strong className={totalRealizedPnl2026 >= 0 ? "text-emerald-400" : "text-red-400"}>
              {totalRealizedPnl2026 >= 0 ? "+" : ""}${fmt(totalRealizedPnl2026)}
            </strong></span>
            <span>Commissioni: <strong className="text-slate-300">${fmt(totalFees2026)}</strong></span>
          </div>
        </div>

        {/* Expandable Content */}
        {isClosedExpanded && (
          <div>
            {/* Tabs Control */}
            <div className="flex border-b border-slate-700/20 text-xs font-semibold px-4 pt-2 bg-slate-800/10">
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTab2026("coins"); }}
                className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                  activeTab2026 === "coins"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Sintesi Coin
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTab2026("fills"); }}
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
                      <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Coin</th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Realized P/L</th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Esecuzioni</th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Commissioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coinSummaries.map((cs) => (
                      <tr key={cs.coin} className="border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors">
                        <td className="font-medium text-slate-200 px-5 py-3">{cs.coin}</td>
                        <td className={`text-right font-mono px-5 py-3 ${cs.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {cs.realizedPnl >= 0 ? "+" : ""}${fmt(cs.realizedPnl)}
                        </td>
                        <td className="text-right font-mono text-slate-300 px-5 py-3">{cs.trades}</td>
                        <td className="text-right font-mono text-slate-400 px-5 py-3">${fmt(cs.fee)}</td>
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
                      <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Data</th>
                      <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Coin</th>
                      <th className="text-center text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Side</th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Prezzo</th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Size</th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">P/L Chiud.</th>
                      <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-5 py-3">Fee</th>
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
                        <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors">
                          <td className="text-slate-400 px-5 py-3 font-mono text-xs">{dateStr}</td>
                          <td className="font-medium text-slate-200 px-5 py-3">{f.coin}</td>
                          <td className="text-center px-5 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              f.side === "B" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                            }`}>
                              {f.side === "B" ? "BUY" : "SELL"}
                            </span>
                          </td>
                          <td className="text-right font-mono text-slate-300 px-5 py-3">${fmt(fPx)}</td>
                          <td className="text-right font-mono text-slate-300 px-5 py-3">{fmt(fSz)}</td>
                          <td className={`text-right font-mono px-5 py-3 ${
                            fPnl > 0 ? "text-emerald-400" : fPnl < 0 ? "text-red-400" : "text-slate-500"
                          }`}>
                            {fPnl > 0 ? "+" : ""}
                            {fPnl !== 0 ? `$${fmt(fPnl)}` : "-"}
                          </td>
                          <td className="text-right font-mono text-slate-400 px-5 py-3">${fmt(fFee)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>

      {/* ---- EQUITY & DRAWDOWN CHARTS ---- */}
      {equitySeries.length > 1 && (
        <div className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-6">
              <div className="flex items-center gap-2 text-slate-300 text-base font-semibold">
                <i className="fas fa-chart-line text-indigo-400" />
                <span>Analisi Storica Mega-Sistema</span>
              </div>
              <div className="flex gap-4 text-xs font-mono text-slate-400">
                <span>Equity: <strong className="text-slate-200">${fmt(equity)}</strong></span>
                <span>Drawdown: <strong className="text-red-400">{(drawdownSeries[drawdownSeries.length - 1]?.drawdown ?? 0).toFixed(2)}%</strong></span>
              </div>
            </div>

            <div className="space-y-6">
              {/* Equity chart */}
              <div>
                <div className="text-slate-400 text-xs font-medium mb-2 flex items-center gap-1">
                  <i className="fas fa-chart-area text-indigo-400/80 text-[10px]" />
                  <span>Net Trading P&L (USD, Iniziale $0)</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equitySeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t: number) =>
                          new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
                        }
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}$${v.toFixed(0)}`}
                        axisLine={false}
                        tickLine={false}
                        width={60}
                      />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          const val = d.equity;
                          return (
                            <div className="rounded-lg border border-slate-600/50 bg-slate-800/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                              <p className="text-[11px] text-slate-400 mb-1">{d.label}</p>
                              <p className="text-xs font-mono text-slate-100">
                                P&L Netto: {val >= 0 ? "+" : ""}${fmt(val)}
                              </p>
                            </div>
                          );
                        }}
                        cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="#818cf8"
                        strokeWidth={2}
                        fill="url(#eqGrad)"
                        dot={false}
                        animationDuration={600}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Drawdown chart */}
              <div>
                <div className="text-slate-400 text-xs font-medium mb-2 flex items-center gap-1">
                  <i className="fas fa-arrow-trend-down text-red-400/80 text-[10px]" />
                  <span>Drawdown (%)</span>
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={drawdownSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t: number) =>
                          new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
                        }
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                      />
                      <YAxis
                        domain={["auto", 0]}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                        axisLine={false}
                        tickLine={false}
                        width={60}
                      />
                      <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                      <Tooltip
                        content={<ChartTooltip valueKey="drawdown" prefix="" suffix="%" />}
                        cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="drawdown"
                        stroke="#ef4444"
                        strokeWidth={2}
                        fill="url(#ddGrad)"
                        dot={false}
                        animationDuration={600}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
