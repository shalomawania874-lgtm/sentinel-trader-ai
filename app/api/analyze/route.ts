import { NextRequest, NextResponse } from "next/server";

function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + (gains / period) / (losses / period));
}

function atr(candles: any[], period = 14) {
  if (candles.length < 2) return 0;
  let total = 0;
  const start = Math.max(1, candles.length - period);
  for (let i = start; i < candles.length; i++) {
    total += Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - candles[i - 1].c),
      Math.abs(candles[i].l - candles[i - 1].c)
    );
  }
  return total / Math.max(1, candles.length - start);
}

export async function POST(req: NextRequest) {
  try {
    const { candles, news = [] } = await req.json();

    if (!Array.isArray(candles) || candles.length < 40) {
      throw new Error("Insufficient market data");
    }

    const closes = candles.map((x: any) => +x.c);
    const fast = ema(closes, 12);
    const slow = ema(closes, 26);
    const r = rsi(closes);
    const a = atr(candles);
    const last = closes[closes.length - 1] ?? 0;
    const prev = closes[closes.length - 2] ?? last;

    let score = 0;
    const reasons: string[] = [];

    if (fast > slow) {
      score += 2;
      reasons.push("EMA trend structure is bullish");
    } else {
      score -= 2;
      reasons.push("EMA trend structure is bearish");
    }

    if (r > 55 && r < 75) {
      score += 1;
      reasons.push("RSI supports bullish momentum");
    } else if (r < 45 && r > 25) {
      score -= 1;
      reasons.push("RSI supports bearish momentum");
    } else {
      reasons.push("RSI is neutral or extended");
    }

    if (last > prev) {
      score += 1;
      reasons.push("Latest close is above the prior close");
    } else if (last < prev) {
      score -= 1;
      reasons.push("Latest close is below the prior close");
    } else {
      reasons.push("Latest close is unchanged from the prior close");
    }

    const headlineText = news
      .map((n: any) => n.title || "")
      .join(" ")
      .toLowerCase();

    const positive = (headlineText.match(/surge|rally|gain|growth|bull|rise|strong|beat/g) || []).length;
    const negative = (headlineText.match(/fall|drop|loss|bear|risk|crash|weak|cut/g) || []).length;

    if (headlineText && positive > negative) {
      score += 0.5;
      reasons.push("Recent headlines have mildly positive market tone");
    } else if (headlineText && negative > positive) {
      score -= 0.5;
      reasons.push("Recent headlines have mildly negative market tone");
    } else {
      reasons.push("Recent headline tone is mixed or unavailable");
    }

    let signal = "WAIT";
    if (score >= 3) signal = "STRONG BUY";
    else if (score >= 1.5) signal = "BUY";
    else if (score <= -3) signal = "STRONG SELL";
    else if (score <= -1.5) signal = "SELL";

    const confidence = Math.min(94, Math.round(52 + (Math.abs(score) / 4.5) * 40));

    if (signal === "WAIT") {
      reasons.push("Factors are not aligned strongly enough, so Sentinel refuses to force a trade");
    }

    return NextResponse.json({
      signal,
      confidence,
      price: last,
      emaFast: fast,
      emaSlow: slow,
      rsi: r,
      atr: a,
      reasons,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "analysis failed" },
      { status: 400 }
    );
  }
}
