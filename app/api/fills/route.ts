import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HL_API = "https://api.hyperliquid.xyz/info";
const USER = "0xB9b7A899C2A6E6BDcc0B87BA2148C1dF046A07e9";


export async function GET() {
  try {
    const res = await fetch(HL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "userFills",
        user: USER,
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `HL API error: ${res.status}` },
        { status: 502 }
      );
    }

    const fills = await res.json();

    return NextResponse.json(
      (fills ?? []).map((f: any) => ({
        coin: f.coin,
        px: f.px,
        sz: f.sz,
        side: f.side,
        fee: f.fee,
        closedPnl: f.closedPnl,
        time: f.time,
      }))
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: `Fetch failed: ${err.message}` },
      { status: 502 }
    );
  }
}
