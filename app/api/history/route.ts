import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

export const dynamic = "force-dynamic";

const DB_PATH = path.join(process.cwd(), "data", "equity.db");
const HL_API = "https://api.hyperliquid.xyz/info";
const USER = "0xB9b7A899C2A6E6BDcc0B87BA2148C1dF046A07e9";

export async function GET() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return NextResponse.json({ snapshots: [], transfers: [] });
    }

    const requireFunc = createRequire(path.join(process.cwd(), "dummy.js"));
    const { DatabaseSync } = requireFunc("node:sqlite");
    const db = new DatabaseSync(DB_PATH);
    const query = db.prepare("SELECT ts, equity FROM snapshots ORDER BY ts ASC");
    const rows = query.all() as any[];
    db.close();

    const snapshots = rows.map((r) => ({
      time: r.ts * 1000,
      equity: r.equity,
    }));

    const firstSnapshotTime = snapshots.length > 0 ? snapshots[0].time : Date.now();

    // Fetch HL ledger transfers
    let transfers: { time: number; amount: number }[] = [];
    try {
      const res = await fetch(HL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "userNonFundingLedgerUpdates", user: USER }),
      });
      if (res.ok) {
        const ledger = await res.json() as any[];
        if (Array.isArray(ledger)) {
          for (const item of ledger) {
            const type = item.delta?.type;
            let amount = 0;
            if (type === "deposit") {
              amount = parseFloat(item.delta.usdc || "0");
            } else if (type === "withdraw") {
              amount = -parseFloat(item.delta.usdc || "0");
            } else if (type === "send") {
              const dest = item.delta.destination || "";
              const src = item.delta.user || "";
              if (dest.toLowerCase() === USER.toLowerCase()) {
                amount = parseFloat(item.delta.amount || "0");
              } else if (src.toLowerCase() === USER.toLowerCase()) {
                amount = -parseFloat(item.delta.amount || "0");
              }
            }

            // Keep only transfers relevant to this snapshot run (filter 2024 out)
            if (amount !== 0 && item.time >= 1767225600000) {
              transfers.push({
                time: item.time,
                amount,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch Hyperliquid transfers:", e);
    }

    // Sort transfers ascending by time
    transfers.sort((a, b) => a.time - b.time);

    return NextResponse.json({
      snapshots,
      transfers,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Database query failed: ${err.message}` },
      { status: 500 }
    );
  }
}
