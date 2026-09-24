# Sentinel Trader AI

Production-oriented market intelligence using verified public market data.

## Accuracy-first architecture
- Deterministic multi-factor ensemble: EMA structure, MACD, RSI, momentum, volume, volatility and regime.
- Freshness gating and explicit NO TRADE/WAIT abstention.
- Chronological walk-forward validation at `/api/backtest`; each prediction only sees candles before its decision.
- Transaction-cost-aware evaluation.
- Evidence confidence is explicitly **not** a probability of winning.
- No fabricated prices, candles, P&L or chart-image analysis.

## Validation standard
A serious accuracy claim requires out-of-sample/walk-forward testing, leakage controls, realistic fees/slippage, enough trades, and results across multiple assets/regimes. Walk-forward validation is a standard way to simulate decisions using only information available before each historical decision, and research warns that information leakage can materially inflate apparent performance. See the cited methodology in the project documentation.

## Data
- Binance Vision public klines for supported USDT crypto pairs.
- Yahoo Finance chart endpoint for broader public equities, indices, FX and commodities.
- Google News RSS for headline context.

This project does **not** claim to be #1 or guarantee profits. The benchmark endpoint is designed to measure where the system actually stands.
