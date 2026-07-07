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

export function buildUnitizedChartSeries(
  history: EquitySnapshot[],
  transfers: { time: number; amount: number }[],
  currentEquity: number
) {
  const snapshots = [...history];
  if (currentEquity > 0) {
    snapshots.push({ time: Date.now(), equity: currentEquity });
  }

  type Event =
    | { type: "snapshot"; time: number; equity: number }
    | { type: "transfer"; time: number; amount: number };

  const events: Event[] = [];
  snapshots.forEach((s) => events.push({ type: "snapshot", time: s.time, equity: s.equity }));
  transfers.forEach((t) => events.push({ type: "transfer", time: t.time, amount: t.amount }));

  // Sort chronologically
  events.sort((a, b) => a.time - b.time);

  let units = 0;
  let nav = 1.0;
  let peakNav = -Infinity;
  let startingPnl: number | null = null;

  const equitySeries: { time: number; equity: number; label: string }[] = [];
  const drawdownSeries: { time: number; drawdown: number; label: string }[] = [];

  for (const ev of events) {
    if (ev.type === "transfer") {
      if (units === 0) {
        units = ev.amount;
        nav = 1.0;
      } else {
        units += ev.amount / nav;
      }
    } else {
      // snapshot event
      if (units > 0) {
        nav = ev.equity / units;
      } else {
        nav = ev.equity > 0 ? ev.equity : 1.0;
      }

      if (nav > peakNav) peakNav = nav;
      const dd = peakNav > 0 ? -((peakNav - nav) / peakNav) * 100 : 0;

      // Net USD PnL = absolute equity - net deposits up to this timestamp
      const netDeposits = transfers
        .filter((t) => t.time <= ev.time)
        .reduce((sum, t) => sum + t.amount, 0);
      const rawPnl = ev.equity - netDeposits;

      if (startingPnl === null) {
        startingPnl = rawPnl;
      }
      const netPnl = rawPnl - startingPnl;

      const label = new Date(ev.time).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      equitySeries.push({ time: ev.time, equity: netPnl, label });
      drawdownSeries.push({ time: ev.time, drawdown: dd, label });
    }
  }

  return { equitySeries, drawdownSeries };
}
