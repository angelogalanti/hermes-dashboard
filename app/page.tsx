"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@tremor/react";

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
  side: "B" | "A"; // B=Buy, A=Sell
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

const fmtPct = (n: number) => {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
};

/** Sum closedPnl from fills in the last N milliseconds. */
function sumClosedPnl(fills: Fill[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return fills.reduce((sum, f) => {
    if (f.time >= cutoff && f.closedPnl) {
      return sum + parseFloat(f.closedPnl);
    }
    return sum;
  }, 0);
}

/**
 * Reconstruct a progressive equity curve by walking fills backwards
 * from current equity.  Returns { peakEquity, maxDrawdownPct }.
 */
function drawdownFromFills(
  fills: Fill[],
  currentEquity: number,
): { peakEquity: number; maxDrawdownPct: number } {
  // Sort fills chronologically (oldest first)
  const sorted = [...fills].sort((a, b) => a.time - b.time);

  let equity = currentEquity;
  let peak = equity;
  let maxDd = 0;

  // Walk backwards: subtract closedPnl of each fill (in reverse order)
  // to reconstruct equity before each fill.
  // Actually, walk forward: start from current equity, walk backwards
  // through fills = walk forward from oldest to newest.
  // Better: reconstruct by walking forward: equity0 = current - sum(all closedPnl)
  // then for each fill in order, equity += closedPnl, track peak & dd.

  const totalPnl = sorted.reduce((s, f) => s + parseFloat(f.closedPnl || "0"), 0);
  equity = currentEquity - totalPnl;

  // Now walk forward through fills
  for (const f of sorted) {
    equity += parseFloat(f.closedPnl || "0");
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  return { peakEquity: peak, maxDrawdownPct: maxDd * 100 };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
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
      const acc: AccountData = await accRes.json();
      const fil: Fill[] = await fillsRes.json();
      setAccount(acc);
      setFills(fil);
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

  return (
    <main className="p-6 max-w-7xl mx-auto">
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

      {/* two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- LEFT: metric cards ---- */}
        <div className="lg:col-span-1 space-y-4">
          {/* Equity */}
          <Card className="bg-slate-800/60 border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <i className="fas fa-wallet" />
              <span>Equity</span>
            </div>
            <p className="text-3xl font-semibold text-slate-100">
              ${fmt(equity)}
            </p>
          </Card>

          {/* P/L 24h */}
          <Card className="bg-slate-800/60 border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <i className="fas fa-clock" />
              <span>P/L 24h</span>
            </div>
            <p
              className={`text-3xl font-semibold ${
                pnl24h >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {pnl24h >= 0 ? "+" : ""}${fmt(pnl24h)}
            </p>
          </Card>

          {/* max Drawdown */}
          <Card className="bg-slate-800/60 border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <i className="fas fa-arrow-trend-down" />
              <span>Max Drawdown</span>
            </div>
            <p className="text-3xl font-semibold text-red-400">
              {maxDrawdownPct > 0 ? "-" : ""}
              {maxDrawdownPct.toFixed(2)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Peak: ${fmt(peakEquity)}
            </p>
          </Card>
        </div>

        {/* ---- RIGHT: positions table ---- */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-800/60 border-slate-700 p-0">
            <div className="flex items-center gap-2 px-6 pt-4 pb-3 text-slate-300 text-sm font-medium">
              <i className="fas fa-layer-group" />
              <span>Posizioni Aperte</span>
              <span className="text-slate-500 text-xs ml-auto">
                {account?.assetPositions.length ?? 0} position
                {(account?.assetPositions.length ?? 0) !== 1 ? "s" : ""}
              </span>
            </div>

            {(!account || account.assetPositions.length === 0) ? (
              <div className="px-6 pb-6 text-slate-500 text-sm">
                {account ? "Nessuna posizione aperta" : "Loading..."}
              </div>
            ) : (
              <Table className="[&_td]:py-2 [&_th]:py-3">
                <TableHead>
                  <TableRow className="border-b border-slate-700/60">
                    <TableHeaderCell className="text-slate-500 text-xs uppercase tracking-wider">
                      Coin
                    </TableHeaderCell>
                    <TableHeaderCell className="text-slate-500 text-xs uppercase tracking-wider text-right">
                      Size
                    </TableHeaderCell>
                    <TableHeaderCell className="text-slate-500 text-xs uppercase tracking-wider text-right">
                      Notional $
                    </TableHeaderCell>
                    <TableHeaderCell className="text-slate-500 text-xs uppercase tracking-wider text-right">
                      Entry
                    </TableHeaderCell>
                    <TableHeaderCell className="text-slate-500 text-xs uppercase tracking-wider text-right">
                      Unreal. P/L
                    </TableHeaderCell>
                    <TableHeaderCell className="text-slate-500 text-xs uppercase tracking-wider text-right">
                      % Book
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {account.assetPositions.map((p) => {
                    const szi = parseFloat(p.szi);
                    const pv = parseFloat(p.positionValue || "0");
                    const upnl = parseFloat(p.unrealizedPnl || "0");
                    const entryPx = parseFloat(p.entryPx || "0");
                    const bookPct =
                      totalPositionValue > 0
                        ? (pv / totalPositionValue) * 100
                        : 0;

                    return (
                      <TableRow
                        key={p.coin}
                        className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors"
                      >
                        <TableCell className="font-medium text-slate-200">
                          {p.coin}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono text-sm ${
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
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-300">
                          ${fmt(pv)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-300">
                          ${fmt(entryPx)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono text-sm ${
                            upnl >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {upnl >= 0 ? "+" : ""}${fmt(upnl)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-400">
                          {bookPct.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
