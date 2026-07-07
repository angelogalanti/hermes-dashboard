"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { BacktestData } from "@/app/lib/types";
import { SYSTEM_COLORS } from "@/app/lib/types";
import { Card, ChartTooltip } from "@/app/components/ui";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface BacktestTabProps {
  backtest: BacktestData | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BacktestTab({ backtest }: BacktestTabProps) {
  const [backtestSystemView, setBacktestSystemView] = useState<"equity" | "drawdown">("equity");
  const [backtestScale, setBacktestScale] = useState<"linear" | "log">("linear");
  const [hiddenSystems, setHiddenSystems] = useState<Record<string, boolean>>({});
  const [showBtc, setShowBtc] = useState(true);

  const toggleSystem = (id: string) => {
    setHiddenSystems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  if (!backtest) {
    return (
      <div className="py-12 text-center text-slate-500 text-sm">
        <i className="fas fa-spinner fa-spin mr-2" />
        Caricamento dati di backtest...
      </div>
    );
  }

  // Build merged timeline for backtest per-system comparison
  const btAllTimes = new Set<number>();
  backtest.systems.forEach((s) => s.daily.forEach((d) => btAllTimes.add(d.time)));
  const btSortedTimes = Array.from(btAllTimes).sort();

  // Downsample for performance: max ~500 points (weekly for long histories)
  const step = Math.max(1, Math.floor(btSortedTimes.length / 500));
  const btSampled = btSortedTimes.filter((_, i) => i % step === 0 || i === btSortedTimes.length - 1);

  const btComparisonEquity = btSampled.map((t) => {
    const point: Record<string, any> = {
      time: t,
      date: new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }),
    };
    backtest.systems.forEach((s) => {
      let val: number | undefined;
      for (let i = s.daily.length - 1; i >= 0; i--) {
        if (s.daily[i].time <= t) {
          val = backtestSystemView === "equity"
            ? s.daily[i].equity * 100
            : s.daily[i].drawdown;
          break;
        }
      }
      point[s.id] = val;
    });

    // Also look up btc_price from backtest.book.daily at or before 't'
    let btcVal: number | undefined;
    for (let i = backtest.book.daily.length - 1; i >= 0; i--) {
      if (backtest.book.daily[i].time <= t) {
        btcVal = backtest.book.daily[i].btc_price;
        break;
      }
    }
    point["btc_price"] = btcVal;

    return point;
  });

  return (
    <div className="mt-6 space-y-6">
      {/* Option bar at the top */}
      <div className="flex justify-between items-center bg-slate-800/30 border border-slate-700/30 rounded-xl px-5 py-3.5 shadow-sm">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Opzioni Grafici</span>
        <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-350 hover:text-white transition-colors select-none">
          <input
            type="checkbox"
            checked={showBtc}
            onChange={(e) => setShowBtc(e.target.checked)}
            className="rounded border-slate-750 bg-slate-900 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900 focus:ring-1 cursor-pointer"
          />
          <span className="flex items-center gap-1.5">
            <i className="fab fa-bitcoin text-amber-400" />
            Mostra Prezzo BTC (Scala DX)
          </span>
        </label>
      </div>
      {/* ---- BACKTEST STORICO MEGA-SISTEMA ---- */}
      {backtest.book.daily.length > 1 && (
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-6">
            <div className="flex items-center gap-2 text-slate-300 text-base font-semibold">
              <i className="fas fa-clock-rotate-left text-violet-400" />
              <span>Backtest Storico — {backtest.book.name}</span>
            </div>
            <div className="flex gap-4 text-xs font-mono text-slate-400">
              <span>{backtest.book.startDate} → {backtest.book.endDate}</span>
              <span className="text-slate-500">({backtest.book.nDays} gg)</span>
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "CAGR", value: `${backtest.book.metrics.cagr.toFixed(1)}%`, color: "text-emerald-400", icon: "chart-line" },
              { label: "Max DD", value: `-${backtest.book.metrics.maxdd.toFixed(2)}%`, color: "text-red-400", icon: "arrow-trend-down" },
              { label: "Calmar", value: backtest.book.metrics.calmar.toFixed(2), color: "text-indigo-400", icon: "scale-balanced" },
              { label: "Sharpe", value: backtest.book.metrics.sharpe.toFixed(2), color: "text-amber-400", icon: "bolt" },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className="rounded-lg bg-slate-700/30 px-4 py-3 border border-slate-700/30">
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
                  <i className={`fas fa-${icon} text-[9px]`} />
                  <span>{label}</span>
                </div>
                <span className={`text-lg font-bold font-mono ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            {/* Backtest Equity chart */}
            <div>
              <div className="text-slate-400 text-xs font-medium mb-2 flex items-center gap-1">
                <i className="fas fa-chart-area text-violet-400/80 text-[10px]" />
                <span>Equity Curve (Backtest, normalizzato 10% DD)</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={backtest.book.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="btEqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(t: number) =>
                        new Date(t).toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
                      }
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={50}
                    />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={(v: number) => `${v.toFixed(1)}×`}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />
                    {showBtc && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "#fbbf24" }}
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                        axisLine={false}
                        tickLine={false}
                        width={45}
                      />
                    )}
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const eqPayload = payload.find((p: any) => p.dataKey === "equity");
                        const btcPayload = showBtc ? payload.find((p: any) => p.dataKey === "btc_price") : null;
                        return (
                          <div className="rounded-lg border border-slate-600/50 bg-slate-800/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                            <p className="text-[11px] text-slate-400 mb-1.5">{d.date}</p>
                            {eqPayload && (
                              <p className="text-xs font-mono text-violet-300">
                                Equity: {eqPayload.value.toFixed(4)}× <span className="text-slate-500 text-[10px]">({((eqPayload.value - 1) * 100).toFixed(1)}%)</span>
                              </p>
                            )}
                            {btcPayload && btcPayload.value !== undefined && (
                              <p className="text-xs font-mono text-amber-400 mt-1">
                                Prezzo BTC: ${btcPayload.value.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        );
                      }}
                      cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 10, color: "#94a3b8", paddingTop: 8 }}
                    />
                    <Area
                      yAxisId="left"
                      name="Equity Mega-Sistema (Scala SX)"
                      type="monotone"
                      dataKey="equity"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      fill="url(#btEqGrad)"
                      dot={false}
                      connectNulls
                      animationDuration={800}
                    />
                    {showBtc && (
                      <Line
                        yAxisId="right"
                        name="Prezzo BTC (Scala DX)"
                        type="monotone"
                        dataKey="btc_price"
                        stroke="#fbbf24"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        connectNulls
                        animationDuration={800}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Backtest Drawdown chart */}
            <div>
              <div className="text-slate-400 text-xs font-medium mb-2 flex items-center gap-1">
                <i className="fas fa-arrow-trend-down text-red-400/80 text-[10px]" />
                <span>Drawdown (%) — Backtest</span>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={backtest.book.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="btDdGrad" x1="0" y1="0" x2="0" y2="1">
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
                        new Date(t).toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
                      }
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={50}
                    />
                    <YAxis
                      domain={["auto", 0]}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                      axisLine={false}
                      tickLine={false}
                      width={50}
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
                      fill="url(#btDdGrad)"
                      dot={false}
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ---- BACKTEST STORICO PER-SISTEMA ---- */}
      {backtest.systems.length > 0 && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/40 pb-3 mb-6">
            <div className="flex items-center gap-2 text-slate-300 text-base font-semibold">
              <i className="fas fa-network-wired text-violet-400" />
              <span>Backtest Storico Per-Sistema (normalizzato 10% DD)</span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Scala Toggle (Linear / Log) */}
              {backtestSystemView === "equity" && (
                <div className="flex border border-slate-600/50 rounded-lg overflow-hidden text-[11px] font-semibold">
                  <button
                    onClick={() => setBacktestScale("linear")}
                    className={`px-3 py-1.5 transition-all cursor-pointer ${
                      backtestScale === "linear"
                        ? "bg-indigo-500/20 text-indigo-400"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Lin
                  </button>
                  <button
                    onClick={() => setBacktestScale("log")}
                    className={`px-3 py-1.5 transition-all cursor-pointer ${
                      backtestScale === "log"
                        ? "bg-indigo-500/20 text-indigo-400"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Log
                  </button>
                </div>
              )}

              {/* Toggle equity/drawdown */}
              <div className="flex border border-slate-600/50 rounded-lg overflow-hidden text-[11px] font-semibold">
                <button
                  onClick={() => setBacktestSystemView("equity")}
                  className={`px-3 py-1.5 transition-all cursor-pointer ${
                    backtestSystemView === "equity"
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Equity
                </button>
                <button
                  onClick={() => setBacktestSystemView("drawdown")}
                  className={`px-3 py-1.5 transition-all cursor-pointer ${
                    backtestSystemView === "drawdown"
                      ? "bg-red-500/20 text-red-400"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Drawdown
                </button>
              </div>
            </div>
          </div>

          {/* Filtro Sistemi */}
          <div className="flex flex-wrap items-center gap-2 mb-4 bg-slate-700/15 p-3 rounded-lg border border-slate-700/20">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mr-1">Filtra Sistemi:</span>
            {backtest.systems.map((s) => {
              const isHidden = !!hiddenSystems[s.id];
              const color = SYSTEM_COLORS[s.id] ?? "#94a3b8";
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSystem(s.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    isHidden
                      ? "bg-slate-800/40 border-slate-700 text-slate-500 hover:text-slate-400"
                      : "bg-slate-700/55 border-slate-650 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: isHidden ? "#64748b" : color,
                      opacity: isHidden ? 0.4 : 1,
                    }}
                  />
                  <span>{s.name}</span>
                  <i className={`fas ${isHidden ? "fa-eye-slash text-slate-500" : "fa-eye text-indigo-400"} text-[10px]`} />
                </button>
              );
            })}
            
            <div className="flex items-center gap-2 ml-auto text-[11px] font-semibold border-l border-slate-700/60 pl-3">
              <button
                onClick={() => setHiddenSystems({})}
                className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                Mostra tutti
              </button>
              <span className="text-slate-600">|</span>
              <button
                onClick={() => {
                  const allHidden: Record<string, boolean> = {};
                  backtest.systems.forEach((s) => {
                    allHidden[s.id] = true;
                  });
                  setHiddenSystems(allHidden);
                }}
                className="text-slate-400 hover:text-slate-350 cursor-pointer"
              >
                Nascondi tutti
              </button>
            </div>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={btComparisonEquity} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t: number) =>
                    new Date(t).toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
                  }
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={50}
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  scale={backtestSystemView === "equity" ? backtestScale : "linear"}
                  domain={backtestSystemView === "equity" ? ["auto", "auto"] : ["auto", 0]}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickFormatter={(v: number) =>
                    backtestSystemView === "equity"
                      ? `${v - 100 >= 0 ? "+" : ""}${(v - 100).toFixed(0)}%`
                      : `${v.toFixed(0)}%`
                  }
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                {showBtc && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 10, fill: "#fbbf24" }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                )}
                {backtestSystemView === "equity" && (
                  <ReferenceLine y={100} stroke="#475569" strokeDasharray="3 3" />
                )}
                {backtestSystemView === "drawdown" && (
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                )}
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    const btcPayload = showBtc ? payload.find((p: any) => p.dataKey === "btc_price") : null;
                    return (
                      <div className="rounded-lg border border-slate-600/50 bg-slate-800/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                        <p className="text-[11px] text-slate-400 mb-1">{d?.date}</p>
                        {payload.map((p: any) => {
                          if (p.dataKey === "btc_price") return null;
                          const displayVal = backtestSystemView === "equity" ? p.value - 100 : p.value;
                          return (
                            <p key={p.dataKey} className="text-xs font-mono" style={{ color: p.color }}>
                              {backtest.systems.find((s) => s.id === p.dataKey)?.name ?? p.dataKey}:{" "}
                              {typeof p.value === "number" ? `${displayVal >= 0 ? "+" : ""}${displayVal.toFixed(2)}%` : "—"}
                            </p>
                          );
                        })}
                        {btcPayload && btcPayload.value !== undefined && (
                          <p className="text-xs font-mono text-amber-400 border-t border-slate-700/50 mt-1.5 pt-1.5">
                            Prezzo BTC: ${btcPayload.value.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    );
                  }}
                  cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
                />
                <Legend
                  onClick={(o: any) => {
                    const { dataKey } = o;
                    if (dataKey) toggleSystem(dataKey);
                  }}
                  formatter={(value: string) => {
                    if (value === "btc_price") return "Prezzo BTC (Scala DX)";
                    const isHidden = !!hiddenSystems[value];
                    return (
                      <span className={`cursor-pointer hover:text-slate-200 transition-colors ${isHidden ? "opacity-40 line-through" : ""}`}>
                        {backtest.systems.find((s) => s.id === value)?.name ?? value}
                      </span>
                    );
                  }}
                  wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                />
                {backtest.systems.map((s) => (
                  <Line
                    yAxisId="left"
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    stroke={SYSTEM_COLORS[s.id] ?? "#94a3b8"}
                    strokeWidth={s.type === "live" ? 2 : 1.5}
                    strokeDasharray={s.type === "forward" ? "6 3" : undefined}
                    dot={false}
                    connectNulls
                    hide={!!hiddenSystems[s.id]}
                    animationDuration={800}
                  />
                ))}
                {showBtc && (
                  <Line
                    yAxisId="right"
                    name="Prezzo BTC (Scala DX)"
                    type="monotone"
                    dataKey="btc_price"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls
                    animationDuration={800}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Metrics table per system */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/40">
                  <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-2">Sistema</th>
                  <th className="text-center text-slate-500 text-xs uppercase tracking-wider px-4 py-2">Tipo</th>
                  <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-4 py-2">CAGR</th>
                  <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-4 py-2">Max DD</th>
                  <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-4 py-2">Calmar</th>
                  <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-4 py-2">Sharpe</th>
                  <th className="text-right text-slate-500 text-xs uppercase tracking-wider px-4 py-2">Leva Norm</th>
                </tr>
              </thead>
              <tbody>
                {backtest.systems.map((s) => {
                  const isHidden = !!hiddenSystems[s.id];
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors ${
                        isHidden ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-200 flex items-center gap-2">
                        <button
                          onClick={() => toggleSystem(s.id)}
                          className="mr-1 text-slate-500 hover:text-slate-350 transition-colors cursor-pointer"
                          title={isHidden ? "Mostra nel grafico" : "Nascondi dal grafico"}
                        >
                          <i className={`fas ${isHidden ? "fa-eye-slash text-slate-500" : "fa-eye text-indigo-400"}`} />
                        </button>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SYSTEM_COLORS[s.id] ?? "#94a3b8" }} />
                        {s.name}
                      </td>
                      <td className="text-center px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          s.type === "live" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          {s.type === "live" ? "LIVE" : "FORWARD"}
                        </span>
                      </td>
                      <td className={`text-right font-mono px-4 py-2.5 ${s.metrics.cagr >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {s.metrics.cagr >= 0 ? "+" : ""}{s.metrics.cagr.toFixed(1)}%
                      </td>
                      <td className="text-right font-mono text-red-400 px-4 py-2.5">
                        -{s.metrics.maxdd.toFixed(2)}%
                      </td>
                      <td className="text-right font-mono text-indigo-400 px-4 py-2.5">
                        {s.metrics.calmar.toFixed(2)}
                      </td>
                      <td className="text-right font-mono text-slate-300 px-4 py-2.5">
                        {s.metrics.sharpe.toFixed(2)}
                      </td>
                      <td className="text-right font-mono text-slate-400 px-4 py-2.5">
                        {s.levNorm}×
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="text-[10px] text-slate-500 text-center">
        Generato: {backtest.generated} · Pesi del book e normalizzazione basati sulle calibrazioni storiche OOS
      </div>
    </div>
  );
}
