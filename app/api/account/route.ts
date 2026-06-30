import { NextResponse } from "next/server";

const HL_API = "https://api.hyperliquid.xyz/info";
const USER = "0xB9b7A899C2A6E6BDcc0B87BA2148C1dF046A07e9";

export async function GET() {
  try {
    const [perpRes, spotRes] = await Promise.all([
      fetch(HL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "clearinghouseState",
          user: USER,
        }),
      }),
      fetch(HL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "spotClearinghouseState",
          user: USER,
        }),
      }),
    ]);

    if (!perpRes.ok || !spotRes.ok) {
      return NextResponse.json(
        { error: `HL API error: perp=${perpRes.status} spot=${spotRes.status}` },
        { status: 502 }
      );
    }

    const perpData = await perpRes.json();
    const spotData = await spotRes.json();

    // 1. Calculate Perp Account Value (perp_av)
    const perpAv = parseFloat(perpData.marginSummary?.accountValue || "0");

    // 2. Calculate Perp Unrealized P&L (perp_upnl)
    const perpUpnl = (perpData.assetPositions ?? []).reduce((sum: number, p: any) => {
      const pos = p.position ?? p;
      return sum + parseFloat(pos.unrealizedPnl || "0");
    }, 0);

    // 3. Calculate Spot USDC Balance (spot_usdc)
    const spotUsdc = (spotData.balances ?? [])
      .filter((b: any) => b.coin === "USDC")
      .reduce((sum: number, b: any) => sum + parseFloat(b.total || "0"), 0);

    // 4. Final Unified Account Value (equity)
    const finalEquity = Math.max(perpAv, spotUsdc + perpUpnl);

    return NextResponse.json({
      accountValue: finalEquity.toString(),
      assetPositions: (perpData.assetPositions ?? []).map((p: any) => {
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
