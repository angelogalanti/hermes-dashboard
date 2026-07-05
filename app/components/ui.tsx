import React from "react";

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-slate-700/50 bg-slate-800/60 p-5 shadow-lg shadow-black/10 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MetricCard                                                         */
/* ------------------------------------------------------------------ */

export function MetricCard({
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
/*  ChartTooltip                                                       */
/* ------------------------------------------------------------------ */

/** Custom tooltip for Recharts charts */
export function ChartTooltip({ active, payload, valueKey, prefix, suffix }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-600/50 bg-slate-800/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-[11px] text-slate-400 mb-0.5">{d.label ?? d.date}</p>
      <p className="text-sm font-semibold font-mono text-slate-100">
        {prefix}{typeof d[valueKey] === "number" ? d[valueKey].toFixed(2) : d[valueKey]}{suffix}
      </p>
    </div>
  );
}
