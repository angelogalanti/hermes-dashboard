import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const BACKTEST_PATH = path.join(process.cwd(), "data", "backtest.json");

export async function GET() {
  try {
    if (!fs.existsSync(BACKTEST_PATH)) {
      return NextResponse.json(
        { error: "backtest.json non trovato. Esegui scripts/export_dashboard_backtest.py" },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(BACKTEST_PATH, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Errore caricamento backtest: ${err.message}` },
      { status: 500 }
    );
  }
}
