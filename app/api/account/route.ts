import { NextResponse } from "next/server";

const HL_API = "https://api.hyperliquid.xyz/info";
const USER = "0xB9b7A899C2A6E6BDcc0B87BA2148C1dF046A07e9";

export async function GET() {
  try {
    const res = await fetch(HL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "clearinghouseState",
        user: USER,
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `HL API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    return NextResponse.json({
      accountValue: data.marginSummary?.accountValue ?? "0",
      assetPositions: (data.assetPositions ?? []).map((p: any) => {
        const pos = p.position ?? p;
        return {
          coin: pos.coin,
          szi: pos.szi,
          entryPx: pos.entryPx,
          positionValue: pos.positionValue,
          unrealizedPnl: pos.unrealizedPnl,
        };
      }),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Fetch failed: ${err.message}` },
      { status: 502 }
    );
  }
}
