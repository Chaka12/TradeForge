// ============================================================================
// OHLCV Data Generator — produces realistic sample market data for seeding
// ============================================================================

import type { OHLCVBar, Timeframe } from '@/types/trading';
import { TIMEFRAMES } from '@/types/trading';

// ---------------------------------------------------------------------------
// Seed symbol configuration
// ---------------------------------------------------------------------------

interface SymbolConfig {
  symbol: string;
  basePrice: number;
  dailyVolatility: number;
  drift: number;
  baseVolume: number;
  category: string;
}

export const SEED_SYMBOLS: SymbolConfig[] = [
  // ── US Stocks ──
  { symbol: 'AAPL',    basePrice: 175,    dailyVolatility: 0.018, drift: 0.0002,  baseVolume: 55_000_000,   category: 'US Stocks' },
  { symbol: 'GOOGL',   basePrice: 140,    dailyVolatility: 0.022, drift: 0.0001,  baseVolume: 25_000_000,   category: 'US Stocks' },
  { symbol: 'MSFT',    basePrice: 380,    dailyVolatility: 0.016, drift: 0.0003,  baseVolume: 22_000_000,   category: 'US Stocks' },
  { symbol: 'AMZN',    basePrice: 180,    dailyVolatility: 0.024, drift: 0.0002,  baseVolume: 45_000_000,   category: 'US Stocks' },
  { symbol: 'TSLA',    basePrice: 245,    dailyVolatility: 0.040, drift: 0.0001,  baseVolume: 95_000_000,   category: 'US Stocks' },
  { symbol: 'NVDA',    basePrice: 875,    dailyVolatility: 0.032, drift: 0.0004,  baseVolume: 40_000_000,   category: 'US Stocks' },
  { symbol: 'META',    basePrice: 505,    dailyVolatility: 0.025, drift: 0.0002,  baseVolume: 18_000_000,   category: 'US Stocks' },
  { symbol: 'NFLX',    basePrice: 628,    dailyVolatility: 0.028, drift: 0.0002,  baseVolume: 8_000_000,    category: 'US Stocks' },
  { symbol: 'JPM',     basePrice: 198,    dailyVolatility: 0.015, drift: 0.0001,  baseVolume: 12_000_000,   category: 'US Stocks' },
  { symbol: 'V',       basePrice: 278,    dailyVolatility: 0.014, drift: 0.0002,  baseVolume: 8_000_000,    category: 'US Stocks' },
  { symbol: 'DIS',     basePrice: 112,    dailyVolatility: 0.020, drift: 0.0001,  baseVolume: 14_000_000,   category: 'US Stocks' },
  { symbol: 'AMD',     basePrice: 165,    dailyVolatility: 0.035, drift: 0.0003,  baseVolume: 55_000_000,   category: 'US Stocks' },

  // ── Indices ──
  { symbol: 'SPX',     basePrice: 5450,   dailyVolatility: 0.010, drift: 0.0003,  baseVolume: 3_800_000_000, category: 'Indices' },
  { symbol: 'NDX',     basePrice: 18500,  dailyVolatility: 0.012, drift: 0.0003,  baseVolume: 320_000_000,   category: 'Indices' },
  { symbol: 'NASDAQ',  basePrice: 16850,  dailyVolatility: 0.013, drift: 0.0003,  baseVolume: 450_000_000,   category: 'Indices' },
  { symbol: 'DJI',     basePrice: 39800,  dailyVolatility: 0.009, drift: 0.0002,  baseVolume: 280_000_000,   category: 'Indices' },
  { symbol: 'RUT',     basePrice: 2050,   dailyVolatility: 0.014, drift: 0.0001,  baseVolume: 50_000_000,    category: 'Indices' },
  { symbol: 'VIX',     basePrice: 15.5,   dailyVolatility: 0.080, drift: -0.001,  baseVolume: 120_000_000,  category: 'Indices' },

  // ── Forex Majors ──
  { symbol: 'EUR/USD', basePrice: 1.085,  dailyVolatility: 0.006, drift: 0.00005, baseVolume: 800_000_000_000, category: 'Forex' },
  { symbol: 'GBP/USD', basePrice: 1.265,  dailyVolatility: 0.007, drift: 0.00004, baseVolume: 400_000_000_000, category: 'Forex' },
  { symbol: 'USD/JPY', basePrice: 154.5,  dailyVolatility: 0.006, drift: 0.00004, baseVolume: 600_000_000_000, category: 'Forex' },
  { symbol: 'USD/CHF', basePrice: 0.885,  dailyVolatility: 0.005, drift: -0.00003,baseVolume: 200_000_000_000, category: 'Forex' },
  { symbol: 'AUD/USD', basePrice: 0.665,  dailyVolatility: 0.007, drift: 0.00003, baseVolume: 250_000_000_000, category: 'Forex' },
  { symbol: 'USD/CAD', basePrice: 1.365,  dailyVolatility: 0.005, drift: -0.00002,baseVolume: 200_000_000_000, category: 'Forex' },
  { symbol: 'NZD/USD', basePrice: 0.615,  dailyVolatility: 0.007, drift: 0.00003, baseVolume: 100_000_000_000, category: 'Forex' },

  // ── Forex Crosses ──
  { symbol: 'EUR/JPY', basePrice: 167.8,  dailyVolatility: 0.007, drift: 0.00004, baseVolume: 250_000_000_000, category: 'Forex' },
  { symbol: 'GBP/JPY', basePrice: 195.4,  dailyVolatility: 0.008, drift: 0.00005, baseVolume: 200_000_000_000, category: 'Forex' },
  { symbol: 'EUR/GBP', basePrice: 0.858,  dailyVolatility: 0.005, drift: 0.00003, baseVolume: 180_000_000_000, category: 'Forex' },
  { symbol: 'EUR/AUD', basePrice: 1.635,  dailyVolatility: 0.008, drift: 0.00004, baseVolume: 150_000_000_000, category: 'Forex' },
  { symbol: 'GBP/AUD', basePrice: 1.905,  dailyVolatility: 0.009, drift: 0.00004, baseVolume: 100_000_000_000, category: 'Forex' },

  // ── Commodities ──
  { symbol: 'GOLD',    basePrice: 2420,   dailyVolatility: 0.009, drift: 0.0002,  baseVolume: 180_000_000,    category: 'Commodities' },
  { symbol: 'XAUUSD',  basePrice: 2425,   dailyVolatility: 0.009, drift: 0.0002,  baseVolume: 220_000_000,    category: 'Commodities' },
  { symbol: 'SILVER',  basePrice: 28.5,   dailyVolatility: 0.015, drift: 0.0001,  baseVolume: 80_000_000,     category: 'Commodities' },
  { symbol: 'OIL',     basePrice: 78.5,   dailyVolatility: 0.020, drift: -0.0001, baseVolume: 150_000_000,    category: 'Commodities' },
  { symbol: 'NATGAS',  basePrice: 2.35,   dailyVolatility: 0.035, drift: -0.0002, baseVolume: 60_000_000,     category: 'Commodities' },
  { symbol: 'COPPER',  basePrice: 4.25,   dailyVolatility: 0.018, drift: 0.0001,  baseVolume: 40_000_000,     category: 'Commodities' },

  // ── Crypto ──
  { symbol: 'BTC/USD', basePrice: 67500,  dailyVolatility: 0.030, drift: 0.0003,  baseVolume: 35_000_000_000,  category: 'Crypto' },
  { symbol: 'ETH/USD', basePrice: 3450,   dailyVolatility: 0.035, drift: 0.0002,  baseVolume: 15_000_000_000,  category: 'Crypto' },
  { symbol: 'SOL/USD', basePrice: 172,    dailyVolatility: 0.045, drift: 0.0003,  baseVolume: 3_000_000_000,   category: 'Crypto' },
  { symbol: 'BNB/USD', basePrice: 595,    dailyVolatility: 0.030, drift: 0.0001,  baseVolume: 1_500_000_000,   category: 'Crypto' },
  { symbol: 'XRP/USD', basePrice: 0.62,   dailyVolatility: 0.040, drift: 0.0001,  baseVolume: 2_000_000_000,   category: 'Crypto' },

  // ── Futures (CME-style) ──
  { symbol: 'ES',      basePrice: 5450,   dailyVolatility: 0.011, drift: 0.0003,  baseVolume: 1_200_000,      category: 'Futures' },
  { symbol: 'NQ',      basePrice: 18500,  dailyVolatility: 0.013, drift: 0.0003,  baseVolume: 600_000,        category: 'Futures' },
  { symbol: 'YM',      basePrice: 39800,  dailyVolatility: 0.010, drift: 0.0002,  baseVolume: 150_000,        category: 'Futures' },
  { symbol: 'CL',      basePrice: 78.5,   dailyVolatility: 0.021, drift: -0.0001, baseVolume: 250_000,        category: 'Futures' },
  { symbol: 'GC',      basePrice: 2420,   dailyVolatility: 0.010, drift: 0.0002,  baseVolume: 180_000,        category: 'Futures' },
];

// ---------------------------------------------------------------------------
// Seeded PRNG — Mulberry32
// ---------------------------------------------------------------------------

function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a seed from a string (deterministic). */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

// ---------------------------------------------------------------------------
// Timeframe helpers
// ---------------------------------------------------------------------------

/** Scale volatility from daily to the given timeframe. */
function volatilityScale(timeframe: Timeframe): number {
  const seconds = TIMEFRAMES[timeframe].seconds;
  const dailySeconds = 86400;
  return Math.sqrt(seconds / dailySeconds);
}

/**
 * Generate a Unix timestamp for a bar at `barIndex`.
 * For intraday timeframes, this respects market sessions (skip non-trading hours).
 * For daily+, it simply adds the timeframe seconds.
 */
function barTimestamp(startDate: Date, barIndex: number, timeframe: Timeframe): number {
  const base = Math.floor(startDate.getTime() / 1000);
  const seconds = TIMEFRAMES[timeframe].seconds;

  // Daily and above: simple interval
  if (seconds >= 86400) {
    return base + barIndex * seconds;
  }

  // Intraday: walk forward bar-by-bar, skipping non-session hours
  // This produces CONSECUTIVE trading-session timestamps with no gaps
  const tfMinutes = seconds / 60;
  let current = new Date(startDate.getTime());
  let generated = 0;

  // Pre-advance to the nearest session boundary if we're outside
  while (generated < barIndex) {
    const ts = Math.floor(current.getTime() / 1000);
    const timeMs = current.getTime();
    const dayOfWeek = current.getUTCDay();
    const hours = current.getUTCHours();
    const minutes = current.getUTCMinutes();

    // Weekend check (Sat = 6, Sun = 0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Skip to Monday 00:00 UTC
      const daysUntilMon = dayOfWeek === 0 ? 1 : 2;
      current.setUTCDate(current.getUTCDate() + daysUntilMon);
      current.setUTCHours(0, 0, 0, 0);
      continue;
    }

    // Session: Forex/crypto trades ~23h (skip 22:00-00:00 UTC for rollover)
    // Stocks trade 14:30-21:00 UTC (9:30-16:00 ET)
    // We use a generous 23h session for forex/crypto/commodities
    // and stock session for stock-like instruments
    const timeInMinutes = hours * 60 + minutes;
    const isStockSession = timeInMinutes >= 870 && timeInMinutes <= 1260; // 14:30-21:00 UTC
    const isForexSession = timeInMinutes >= 0 && timeInMinutes < 1380;   // 00:00-23:00 UTC (skip 23:00-00:00)

    // Align to session start if we're in the gap
    const inStockGap = !isStockSession;
    const inForexGap = timeInMinutes >= 1380; // 23:00-00:00 UTC

    // For simplicity, use forex-style 24h session (no gaps) for forex/crypto/commodities
    // and stock session for stocks
    // Actually, for best chart experience, let's just produce consecutive timestamps
    // without session gaps. The user wants no gaps, and this is a simulator.
    // We'll use a simple 24h model with slight volume variation.

    if (generated < barIndex) {
      // Advance by one bar
      current = new Date(current.getTime() + seconds * 1000);
      generated++;
    }
  }

  return Math.floor(current.getTime() / 1000);
}

/**
 * Simplified timestamp generator that produces strictly consecutive bars
 * with no gaps. Uses a rolling approach: each bar is exactly `seconds` after
 * the previous one.
 */
function consecutiveTimestamps(startDate: Date, barCount: number, timeframe: Timeframe): number[] {
  const seconds = TIMEFRAMES[timeframe].seconds;
  const base = Math.floor(startDate.getTime() / 1000);
  const timestamps: number[] = [];
  for (let i = 0; i < barCount; i++) {
    timestamps.push(base + i * seconds);
  }
  return timestamps;
}

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

/**
 * Generate realistic OHLCV bar data.
 *
 * Uses geometric Brownian motion with mean-reversion for smooth,
 * gap-free price action. Each bar's close is the next bar's open
 * (no gaps between bars). Adds micro-structure noise for realism.
 *
 * @param symbol   Ticker symbol
 * @param startDate  The date/time of the first bar
 * @param barCount   Number of bars to generate
 * @param timeframe  Bar timeframe
 * @param seed       Optional RNG seed for reproducibility
 */
export function generateOHLCV(
  symbol: string,
  startDate: Date,
  barCount: number,
  timeframe: Timeframe,
  seed?: number,
): OHLCVBar[] {
  const config = SEED_SYMBOLS.find((s) => s.symbol === symbol);
  const basePrice = config?.basePrice ?? 100;
  const dailyVol = config?.dailyVolatility ?? 0.02;
  const drift = config?.drift ?? 0.0002;
  const baseVolume = config?.baseVolume ?? 10_000_000;

  const rng = createRng(seed ?? hashString(symbol + startDate.toISOString() + timeframe));
  const vScale = volatilityScale(timeframe);
  const vol = dailyVol * vScale;

  const bars: OHLCVBar[] = [];
  const timestamps = consecutiveTimestamps(startDate, barCount, timeframe);

  // ── Regime phases for realistic market structure ──
  const phaseCount = 8 + Math.floor(rng() * 8);
  const phaseLengths: number[] = [];
  let remaining = barCount;
  for (let p = 0; p < phaseCount && remaining > 0; p++) {
    const isLast = p === phaseCount - 1;
    const len = isLast ? remaining : Math.max(8, Math.floor(remaining / (phaseCount - p) * (0.4 + rng() * 1.2)));
    phaseLengths.push(Math.min(len, remaining));
    remaining -= Math.min(len, remaining);
  }

  // Each phase: trend direction and strength + volatility modifier
  const phaseDrifts = phaseLengths.map(() => {
    const r = rng();
    if (r < 0.25) return -drift * (2 + rng() * 3);  // downtrend
    if (r < 0.50) return drift * (2 + rng() * 3);    // uptrend
    if (r < 0.70) return drift * 0.3;                  // mild up
    if (r < 0.85) return -drift * 0.3;                 // mild down
    return 0;                                           // sideways
  });

  const phaseVolMods = phaseLengths.map(() => 0.6 + rng() * 0.8); // 0.6-1.4x volatility

  // ── Mean-reversion level (tracks a moving average of price) ──
  let price = basePrice;
  let meanLevel = basePrice;
  const meanReversionStrength = 0.002; // gentle pull back to mean

  let phaseIdx = 0;
  let barsInPhase = 0;

  for (let i = 0; i < barCount; i++) {
    // Advance phase
    if (phaseIdx < phaseLengths.length && barsInPhase >= phaseLengths[phaseIdx]) {
      phaseIdx++;
      barsInPhase = 0;
    }
    const effectiveDrift = phaseIdx < phaseDrifts.length ? phaseDrifts[phaseIdx] : drift;
    const effectiveVol = phaseIdx < phaseVolMods.length ? vol * phaseVolMods[phaseIdx] : vol;

    // GBM with mean reversion
    const z = normalRandom(rng);
    const reversionPull = meanReversionStrength * (meanLevel - price) / price;
    const ret = effectiveDrift + reversionPull + effectiveVol * z;
    const rawClose = price * (1 + ret);
    const close = Math.max(rawClose, 0.0001);

    // Update mean level (slow EMA)
    meanLevel = meanLevel * 0.998 + close * 0.002;

    // ── Intra-bar price construction ──
    // Open = previous close (no gaps!)
    const open = price;

    // Body range: proportional to volatility, clipped to avoid unrealistic bars
    const bodySize = Math.abs(close - open);
    const maxBody = close * effectiveVol * 2.5;
    const clampedBody = Math.min(bodySize, maxBody);

    // High and Low: extend beyond the body with wicks
    const wickExtension = close * effectiveVol * (0.2 + rng() * 0.8);
    const upperWick = wickExtension * (0.3 + rng() * 0.7);
    const lowerWick = wickExtension * (0.3 + rng() * 0.7);

    const high = Math.max(open, close) + upperWick;
    let low = Math.min(open, close) - lowerWick;
    low = Math.max(low, 0.0001);

    // Ensure OHLC consistency
    const finalHigh = Math.max(high, Math.max(open, close));
    const finalLow = Math.min(low, Math.min(open, close));

    // ── Volume with realistic patterns ──
    let volume = baseVolume * (0.5 + rng() * 1.0);

    // Volume spike on large moves
    const barRange = finalHigh - finalLow;
    const avgPrice = (finalHigh + finalLow) / 2;
    if (avgPrice > 0) {
      const rangePercent = barRange / avgPrice;
      volume *= (1 + rangePercent * 10); // bigger bars = more volume
    }

    // Volume tends to cluster (use previous bar's volume as anchor)
    if (i > 0) {
      const prevVol = bars[i - 1].volume;
      volume = volume * 0.3 + prevVol * 0.7; // mean-revert to previous
      volume *= (0.8 + rng() * 0.4); // add noise
    }

    volume = Math.max(100, Math.round(volume));

    bars.push({
      time: timestamps[i],
      open: roundToPrecision(open),
      high: roundToPrecision(finalHigh),
      low: roundToPrecision(finalLow),
      close: roundToPrecision(close),
      volume,
    });

    price = close;
    barsInPhase++;
  }

  return bars;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Box-Muller transform to produce normally distributed random numbers. */
function normalRandom(rng: () => number): number {
  let u1 = rng();
  let u2 = rng();
  u1 = Math.max(1e-10, Math.min(1 - 1e-10, u1));
  u2 = Math.max(1e-10, Math.min(1 - 1e-10, u2));
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Round to appropriate decimal places based on price magnitude. */
function roundToPrecision(n: number): number {
  if (n >= 10000) return Math.round(n);
  if (n >= 100) return Math.round(n * 100) / 100;
  if (n >= 1) return Math.round(n * 10000) / 10000;
  return Math.round(n * 100000) / 100000; // 5 decimal places for forex sub-1.0
}
