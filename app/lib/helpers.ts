import type { Fill, EquitySnapshot } from "./types";

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

export const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/* ------------------------------------------------------------------ */
/*  PnL helpers                                                        */
/* ------------------------------------------------------------------ */

/** Sum closedPnl from fills in the last N ms. */
export function sumClosedPnl(fills: Fill[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return fills.reduce((sum, f) => {
    if (f.time >= cutoff && f.closedPnl) return sum + parseFloat(f.closedPnl);
    return sum;
  }, 0);
}

/* ------------------------------------------------------------------ */
/*  Drawdown / equity helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Walk database snapshots chronologically and compute peak equity and max drawdown %.
 */
export function drawdownFromHistory(
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

/**
 * Build chart-ready series from equity snapshots:
 *  - equitySeries: [{time, equity, label}]
 *  - drawdownSeries: [{time, drawdown, label}]  (drawdown as negative %)
 */
export function buildChartSeries(history: EquitySnapshot[], currentEquity: number) {
  const points = [...history];
  if (currentEquity > 0) {
    points.push({ time: Date.now(), equity: currentEquity });
  }
  if (points.length === 0) return { equitySeries: [], drawdownSeries: [] };

  let peak = -Infinity;
  const equitySeries: { time: number; equity: number; label: string }[] = [];
  const drawdownSeries: { time: number; drawdown: number; label: string }[] = [];

  for (const p of points) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? -((peak - p.equity) / peak) * 100 : 0;
    const label = new Date(p.time).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    equitySeries.push({ time: p.time, equity: p.equity, label });
    drawdownSeries.push({ time: p.time, drawdown: dd, label });
  }

  return { equitySeries, drawdownSeries };
}
