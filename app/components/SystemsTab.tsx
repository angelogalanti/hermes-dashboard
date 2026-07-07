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
import type { SystemData } from "@/app/lib/types";
import { SYSTEM_COLORS } from "@/app/lib/types";
import { Card } from "@/app/components/ui";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SystemsTabProps {
  systems: SystemData[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SystemsTab({ systems }: SystemsTabProps) {
  if (systems.length === 0) return null;

  const liveSystems = systems.filter((s) => s.type === "live");
  const forwardSystems = systems.filter((s) => s.type === "forward");

  // Build comparison data: merge all systems into a unified timeline
  const allTimes = new Set<number>();
  systems.forEach((s) => s.history.forEach((h) => allTimes.add(h.time)));
  const sortedTimes = Array.from(allTimes).sort();

  const comparisonData = sortedTimes.map((t) => {
    const point: Record<string, any> = {
      time: t,
      label: new Date(t).toLocaleDateString("it-IT", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      }),
    };
    systems.forEach((s) => {
      // Find closest point at or before this time
      let val: number | undefined;
      for (let i = s.history.length - 1; i >= 0; i--) {
        if (s.history[i].time <= t) {
          val = s.history[i].returnPct;
          break;
        }
      }
      point[s.id] = val;
    });

    // Calculate Mega-Sistema Portfolio return (weighted sum of live active systems)
    // weights: MR 32% / Trend 25% / StdDev 15% / Donchian 15% (normalized to sum to 1.0)
    let megaVal = 0;
    const WEIGHTS: Record<string, number> = {
      btc_mean_reversion: 0.32 / 0.87,
      trend_multiasset: 0.25 / 0.87,
      stddev: 0.15 / 0.87,
      donchian: 0.15 / 0.87,
    };
    Object.keys(WEIGHTS).forEach((id) => {
      megaVal += (point[id] ?? 0) * WEIGHTS[id];
    });
    point["mega_portfolio"] = megaVal;

    return point;
  });

  return (
    <div className="mt-6 space-y-6">
      {/* 1. Mega-Sistema Chart Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-6">
          <div className="flex items-center gap-2 text-slate-300 text-base font-semibold">
            <i className="fas fa-wallet text-indigo-400" />
            <span>Mega-Sistema Combinato (Forward Test Paper)</span>
          </div>
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider hidden sm:block">
            Pesi: MR 36.8% · Trend 28.7% · StdDev 17.2% · Donchian 17.2%
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={comparisonData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="megaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
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
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="rounded-lg border border-slate-600/50 bg-slate-800/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                      <p className="text-[11px] text-slate-400 mb-1">{d?.label}</p>
                      <p className="text-xs font-mono text-indigo-300">
                        Rendimento: {d?.mega_portfolio >= 0 ? "+" : ""}{d?.mega_portfolio?.toFixed(2)}%
                      </p>
                    </div>
                  );
                }}
                cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
              />
              <Area
                type="stepAfter"
                dataKey="mega_portfolio"
                stroke="#818cf8"
                strokeWidth={2}
                fill="url(#megaGrad)"
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 2. Comparison chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-6">
          <div className="flex items-center gap-2 text-slate-300 text-base font-semibold">
            <i className="fas fa-layer-group text-amber-400" />
            <span>Confronto Sistemi (Forward Test Paper)</span>
          </div>
          <div className="flex gap-3 text-[10px] font-semibold uppercase tracking-wider">
            <span className="text-indigo-400">● Live</span>
            <span className="text-slate-500">● Forward</span>
          </div>
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparisonData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="rounded-lg border border-slate-600/50 bg-slate-800/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                      <p className="text-[11px] text-slate-400 mb-1">{d?.label}</p>
                      {payload.map((p: any) => (
                        <p key={p.dataKey} className="text-xs font-mono" style={{ color: p.color }}>
                          {systems.find((s) => s.id === p.dataKey)?.name ?? p.dataKey}:{" "}
                          {typeof p.value === "number" ? `${p.value >= 0 ? "+" : ""}${p.value.toFixed(2)}%` : "—"}
                        </p>
                      ))}
                    </div>
                  );
                }}
                cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
              />
              <Legend
                formatter={(value: string) => systems.find((s) => s.id === value)?.name ?? value}
                wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
              />
              {systems.map((s) => (
                <Line
                  key={s.id}
                  type="stepAfter"
                  dataKey={s.id}
                  stroke={SYSTEM_COLORS[s.id] ?? "#94a3b8"}
                  strokeWidth={s.type === "live" ? 2 : 1.5}
                  strokeDasharray={s.type === "forward" ? "6 3" : undefined}
                  dot={false}
                  connectNulls
                  animationDuration={600}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* System summary cards */}
      {[{ label: "Sistemi Live", icon: "bolt", color: "text-emerald-400", list: liveSystems },
        { label: "Forward Testing", icon: "flask", color: "text-amber-400", list: forwardSystems },
      ].map(({ label, icon, color, list }) => list.length > 0 && (
        <div key={label}>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <i className={`fas fa-${icon} ${color}`} />
            <span>{label}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {list.map((s) => {
              const retColor = s.cumulativeReturnPct >= 0 ? "text-emerald-400" : "text-red-400";
              const staleHours = s.lastProcessedTs
                ? (Date.now() - Date.parse(s.lastProcessedTs)) / 3600000
                : Infinity;
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-200">{s.name}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        s.killed ? "bg-red-500" : staleHours > 36 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      title={s.killed ? "Killed" : staleHours > 36 ? "Stale" : "Alive"}
                    />
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Return</span>
                      <span className={`font-mono font-semibold ${retColor}`}>
                        {s.cumulativeReturnPct >= 0 ? "+" : ""}{s.cumulativeReturnPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Max DD</span>
                      <span className="font-mono text-red-400">
                        -{s.maxDrawdownPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Giorni</span>
                      <span className="font-mono text-slate-300">{s.nDaysProcessed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Trade (Stima)</span>
                      <span className="font-mono text-slate-300" title={`Frequenza storica: ~${s.avgTradesPerMonth}/mese`}>
                        {s.estimatedTrades} <span className="text-[10px] text-slate-500">(~{s.avgTradesPerMonth}/m)</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Anchor</span>
                      <span className="font-mono text-slate-400 text-[10px]">{s.forwardCutoff}</span>
                    </div>
                  </div>
                  {/* Mini sparkline */}
                  {s.history.length > 1 && (
                    <div className="h-12 mt-2 -mx-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={s.history} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                          <defs>
                            <linearGradient id={`spark-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={SYSTEM_COLORS[s.id] ?? "#94a3b8"} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={SYSTEM_COLORS[s.id] ?? "#94a3b8"} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area
                            type="stepAfter"
                            dataKey="returnPct"
                            stroke={SYSTEM_COLORS[s.id] ?? "#94a3b8"}
                            strokeWidth={1.5}
                            fill={`url(#spark-${s.id})`}
                            dot={false}
                            animationDuration={400}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
