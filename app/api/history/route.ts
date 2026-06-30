import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

const DB_PATH = path.join(process.cwd(), "data", "equity.db");

export async function GET() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return NextResponse.json([]);
    }

    const requireFunc = createRequire(path.join(process.cwd(), "dummy.js"));
    const { DatabaseSync } = requireFunc("node:sqlite");
    const db = new DatabaseSync(DB_PATH);
    const query = db.prepare("SELECT ts, equity FROM snapshots ORDER BY ts ASC");
    const rows = query.all() as any[];
    db.close();

    return NextResponse.json(
      rows.map((r) => ({
        time: r.ts * 1000,
        equity: r.equity,
      }))
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: `Database query failed: ${err.message}` },
      { status: 500 }
    );
  }
}
