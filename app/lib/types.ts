/* ------------------------------------------------------------------ */
/*  Shared TypeScript types for the Trading Dashboard                  */
/* ------------------------------------------------------------------ */

export interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
}

export interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  fee: string;
  closedPnl: string;
  time: number;
}

export interface AccountData {
  accountValue: string;
  assetPositions: Position[];
}

export interface EquitySnapshot {
  time: number;
  equity: number;
}

export interface SystemHistoryPoint {
  time: number;
  wealth: number;
  returnPct: number;
  drawdown: number;
  dateStr: string;
}

export interface SystemData {
  id: string;
  name: string;
  type: "live" | "forward";
  forwardCutoff: string;
  lastProcessedTs: string;
  nDaysProcessed: number;
  cumulativeWealth: number;
  cumulativeReturnPct: number;
  maxDrawdownPct: number;
  killed: boolean;
  killTs: string;
  avgTradesPerMonth: number;
  estimatedTrades: number;
  history: SystemHistoryPoint[];
}

export interface BacktestDailyPoint {
  date: string;
  time: number;
  equity: number;
  drawdown: number;
  btc_price?: number;
}

export interface BacktestSystemMetrics {
  cagr: number;
  maxdd: number;
  calmar: number;
  sharpe: number;
}

export interface BacktestSystem {
  id: string;
  name: string;
  type: "live" | "forward";
  levNorm: number;
  metrics: BacktestSystemMetrics;
  daily: BacktestDailyPoint[];
}

export interface BacktestData {
  generated: string;
  book: {
    name: string;
    startDate: string;
    endDate: string;
    nDays: number;
    metrics: BacktestSystemMetrics;
    daily: BacktestDailyPoint[];
  };
  systems: BacktestSystem[];
}

export interface CoinSummary {
  coin: string;
  realizedPnl: number;
  fee: number;
  trades: number;
}

/** Color map for system chart lines */
export const SYSTEM_COLORS: Record<string, string> = {
  aw_multiasset: "#818cf8", // indigo
  btc_mean_reversion: "#818cf8", // indigo
  trend_multiasset: "#6366f1",   // violet
  donchian: "#f59e0b",      // amber
  stddev: "#10b981",        // emerald
  volsqueeze: "#f43f5e",    // rose
  donchian_tilt: "#38bdf8",     // light blue/cyan
  donchian_baseline: "#06b6d4", // cyan
  nextbar_book: "#a855f7",  // purple
};

export interface DataFileStatus {
  timeframe: string;
  type: "spot" | "perp" | "forex";
  startDate: string;
  endDate: string;
  rowCount: number;
  fileSize: number;
}

export interface AssetStatus {
  symbol: string;
  category: "crypto" | "forex" | "futures";
  files: DataFileStatus[];
}

export interface DataStatusResponse {
  crypto: AssetStatus[];
  forex: AssetStatus[];
  futures: AssetStatus[];
}

