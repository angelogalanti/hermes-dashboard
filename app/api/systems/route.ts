import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const FORWARD_DIR = "/home/x/repos/auto-researchtrading/main/registry/forward";

const SYSTEMS_CONFIG = [
  { file: "aw_multiasset_v1_state.json", id: "aw_multiasset", name: "AllWeather", type: "live", avgTradesPerMonth: 14.0 },
  { file: "donchian_v1_state.json", id: "donchian", name: "Donchian", type: "live", avgTradesPerMonth: 45.5 },
  { file: "stddev_v1_state.json", id: "stddev", name: "StdDev", type: "live", avgTradesPerMonth: 12.5 },
  { file: "volsqueeze_v1_state.json", id: "volsqueeze", name: "VolSqueeze", type: "forward", avgTradesPerMonth: 7.0 },
  { file: "donchian_tilt_v1_state.json", id: "donchian_tilt", name: "Donchian Tilt", type: "forward", avgTradesPerMonth: 45.5 },
  { file: "nextbar_book_v1_state.json", id: "nextbar_book", name: "Nextbar Book", type: "forward", avgTradesPerMonth: 15.0 }, // Ribilanciamento ogni 2 giorni -> ~15/mese
];

export async function GET() {
  try {
    if (!fs.existsSync(FORWARD_DIR)) {
      return NextResponse.json({ error: "Directory registry/forward non trovata" }, { status: 404 });
    }

    const data = SYSTEMS_CONFIG.map((sys) => {
      const filePath = path.join(FORWARD_DIR, sys.file);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const json = JSON.parse(content);

      // Construct bar logs with an initial point at forward_cutoff
      const barLogs = [];
      const cutoffTime = Date.parse(json.forward_cutoff + "T00:00:00Z");
      if (!isNaN(cutoffTime)) {
        barLogs.push({
          time: cutoffTime,
          wealth: 1.0,
          returnPct: 0.0,
          drawdown: 0.0,
          dateStr: new Date(cutoffTime).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "short",
          }),
        });
      }

      (json.bar_log || []).forEach((b: any) => {
        const wealth = b.wealth ?? 1.0;
        const peak = b.peak ?? wealth;
        const drawdown = peak > 0 ? -((peak - wealth) / peak) * 100 : 0;
        barLogs.push({
          time: Date.parse(b.ts),
          wealth: wealth,
          returnPct: (wealth - 1.0) * 100,
          drawdown: drawdown,
          dateStr: new Date(b.ts).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      });

      // Calculate max drawdown
      let maxDd = 0;
      (json.bar_log || []).forEach((b: any) => {
        const wealth = b.wealth ?? 1.0;
        const peak = b.peak ?? wealth;
        const dd = peak > 0 ? (peak - wealth) / peak : 0;
        if (dd > maxDd) maxDd = dd;
      });

      // Calculate estimated trades during the forward period
      const days = json.n_days_processed || 0;
      const estimatedTrades = Math.max(
        sys.id === "nextbar_book" ? 4 : 1, // Nextbar has processed 4 periods
        Math.round(sys.avgTradesPerMonth * (days / 30.4))
      );

      return {
        id: sys.id,
        name: sys.name,
        type: sys.type, // "live" | "forward"
        forwardCutoff: json.forward_cutoff,
        lastProcessedTs: json.last_processed_ts,
        nDaysProcessed: days,
        cumulativeWealth: json.cumulative_wealth,
        cumulativeReturnPct: (json.cumulative_wealth - 1.0) * 100,
        maxDrawdownPct: maxDd * 100,
        killed: json.killed,
        killTs: json.kill_ts,
        avgTradesPerMonth: sys.avgTradesPerMonth,
        estimatedTrades: estimatedTrades,
        history: barLogs,
      };
    }).filter(Boolean);

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Errore durante il caricamento dei sistemi: ${err.message}` },
      { status: 500 }
    );
  }
}
