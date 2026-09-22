import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "BTCUSDT")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const interval = req.nextUrl.searchParams.get("interval") || "1h";
  const limit = Math.min(500, Math.max(40, Number(req.nextUrl.searchParams.get("limit") || 120)));

  try {
    if (/^[A-Z0-9]{3,12}USDT$/.test(symbol)) {
      const query =
        "?symbol=" + encodeURIComponent(symbol) +
        "&interval=" + encodeURIComponent(interval) +
        "&limit=" + limit;

      const providers = [
        "https://data-api.binance.vision/api/v3/klines" + query,
        "https://api.binance.com/api/v3/klines" + query,
      ];

      for (const endpoint of providers) {
        try {
          const response = await fetch(endpoint, { cache: "no-store" });
          if (!response.ok) continue;
          const rows = await response.json();
          if (!Array.isArray(rows) || rows.length < 2) continue;

          const candles = rows.map((r: any[]) => ({
            t: Number(r[0]),
            o: Number(r[1]),
            h: Number(r[2]),
            l: Number(r[3]),
            c: Number(r[4]),
            v: Number(r[5]),
          }));

          return NextResponse.json({
            provider: endpoint.startsWith("https://data-api") ? "Binance Vision" : "Binance",
            symbol,
            interval,
            candles,
            price: candles[candles.length - 1]?.c ?? null,
            updatedAt: new Date().toISOString(),
          });
        } catch {
          // Try the next provider.
        }
      }

      return NextResponse.json(
        { error: "DATA UNAVAILABLE", reason: "No crypto market provider returned valid data" },
        { status: 503 }
      );
    }

    const endpoint =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?interval=" + encodeURIComponent(interval) +
      "&range=6mo";

    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("Yahoo Finance provider unavailable");

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0];

    if (!result || !quote || timestamps.length < 2) {
      throw new Error("No market data returned for " + symbol);
    }

    const candles = timestamps
      .map((t: number, i: number) => ({
        t: t * 1000,
        o: Number(quote.open?.[i]),
        h: Number(quote.high?.[i]),
        l: Number(quote.low?.[i]),
        c: Number(quote.close?.[i]),
        v: Number(quote.volume?.[i] ?? 0),
      }))
      .filter((x: any) => Number.isFinite(x.c));

    if (candles.length < 2) throw new Error("No usable market data returned");

    return NextResponse.json({
      provider: "Yahoo Finance",
      symbol,
      interval,
      candles,
      price: candles[candles.length - 1]?.c ?? null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "DATA UNAVAILABLE",
        reason: error instanceof Error ? error.message : "Market provider unavailable",
      },
      { status: 503 }
    );
  }
}
