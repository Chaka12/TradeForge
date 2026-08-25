// ============================================================================
// Built-in Indicator Calculation Engine
// ============================================================================

import type { OHLCVBar, IndicatorDefinition } from '@/types/trading';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill leading NaN values to ensure all output arrays are the same length as input. */
function padStart(result: number[], length: number): number[] {
  if (result.length >= length) return result.slice(-length);
  const pad = new Array(length - result.length).fill(NaN);
  return [...pad, ...result];
}

// ---------------------------------------------------------------------------
// SMA — Simple Moving Average
// ---------------------------------------------------------------------------

function sma(bars: OHLCVBar[], params: Record<string, number>): number[] {
  const period = Math.max(1, Math.round(params.period || 14));
  const closes = bars.map((b) => b.close);
  const result: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    result.push(sum / period);
  }

  return result;
}

// ---------------------------------------------------------------------------
// EMA — Exponential Moving Average
// ---------------------------------------------------------------------------

function ema(bars: OHLCVBar[], params: Record<string, number>): number[] {
  const period = Math.max(1, Math.round(params.period || 14));
  const closes = bars.map((b) => b.close);
  const result: number[] = [];
  const k = 2 / (period + 1);

  // Seed with SMA of the first `period` closes
  let emaValue: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    if (emaValue === null) {
      // Compute SMA seed
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      emaValue = sum / period;
      result.push(emaValue);
    } else {
      emaValue = closes[i] * k + emaValue * (1 - k);
      result.push(emaValue);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// RSI — Relative Strength Index (Wilder's smoothing)
// ---------------------------------------------------------------------------

function rsi(bars: OHLCVBar[], params: Record<string, number>): number[] {
  const period = Math.max(2, Math.round(params.period || 14));
  const closes = bars.map((b) => b.close);
  const result: number[] = [];

  if (closes.length < period + 1) {
    return closes.map(() => NaN);
  }

  // Compute price changes
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // First `period` changes for initial average gain / loss
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  // Push NaN for bars before we have enough data (period + 1 bars → first RSI at index period)
  for (let i = 0; i < period; i++) {
    result.push(NaN);
  }

  // First RSI value
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRS));

  // Subsequent values use Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return padStart(result, closes.length);
}

// ---------------------------------------------------------------------------
// MACD — Moving Average Convergence Divergence
// ---------------------------------------------------------------------------

function computeEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let emaVal: number | null = null;

  for (let i = 0; i < values.length; i++) {
    if (isNaN(values[i])) {
      result.push(NaN);
      continue;
    }
    if (emaVal === null) {
      // Seed: find first valid values to average
      const startIdx = Math.max(0, i - period + 1);
      let sum = 0;
      let count = 0;
      for (let j = startIdx; j <= i; j++) {
        if (!isNaN(values[j])) {
          sum += values[j];
          count++;
        }
      }
      if (count === 0) {
        result.push(NaN);
        continue;
      }
      emaVal = sum / count;
      result.push(emaVal);
    } else {
      emaVal = values[i] * k + emaVal * (1 - k);
      result.push(emaVal);
    }
  }

  return result;
}

function macd(
  bars: OHLCVBar[],
  params: Record<string, number>,
): Record<string, number[]> {
  const fast = Math.max(1, Math.round(params.fast || 12));
  const slow = Math.max(2, Math.round(params.slow || 26));
  const signal = Math.max(1, Math.round(params.signal || 9));

  const closes = bars.map((b) => b.close);
  const fastEMA = computeEMA(closes, fast);
  const slowEMA = computeEMA(closes, slow);

  const macdLine = closes.map((_, i) =>
    isNaN(fastEMA[i]) || isNaN(slowEMA[i]) ? NaN : fastEMA[i] - slowEMA[i],
  );

  const signalLine = computeEMA(
    macdLine.map((v) => (isNaN(v) ? 0 : v)),
    signal,
  );

  const histogram = macdLine.map((v, i) =>
    isNaN(v) || isNaN(signalLine[i]) ? NaN : v - signalLine[i],
  );

  return { macd: macdLine, signal: signalLine, histogram };
}

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

function bollingerBands(
  bars: OHLCVBar[],
  params: Record<string, number>,
): Record<string, number[]> {
  const period = Math.max(2, Math.round(params.period || 20));
  const stdDevMult = params.stdDev ?? 2;

  const closes = bars.map((b) => b.close);
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      middle.push(NaN);
      lower.push(NaN);
      continue;
    }

    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    const mean = sum / period;
    middle.push(mean);

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (closes[j] - mean) ** 2;
    }
    const std = Math.sqrt(variance / period);

    upper.push(mean + stdDevMult * std);
    lower.push(mean - stdDevMult * std);
  }

  return { upper, middle, lower };
}

// ---------------------------------------------------------------------------
// ATR — Average True Range (Wilder's smoothing)
// ---------------------------------------------------------------------------

function atr(bars: OHLCVBar[], params: Record<string, number>): number[] {
  const period = Math.max(1, Math.round(params.period || 14));
  const result: number[] = [];

  if (bars.length < 2) {
    return bars.map(() => NaN);
  }

  // True range for each bar
  const trueRanges: number[] = [];
  trueRanges.push(bars[0].high - bars[0].low); // first bar: just high - low

  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    trueRanges.push(tr);
  }

  // First ATR = simple average of first `period` true ranges
  let atrValue: number | null = null;

  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    if (atrValue === null) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += trueRanges[j];
      }
      atrValue = sum / period;
      result.push(atrValue);
    } else {
      atrValue = (atrValue * (period - 1) + trueRanges[i]) / period;
      result.push(atrValue);
    }
  }

  return padStart(result, bars.length);
}

// ---------------------------------------------------------------------------
// Volume MA — Volume Moving Average
// ---------------------------------------------------------------------------

function volumeMA(bars: OHLCVBar[], params: Record<string, number>): number[] {
  const period = Math.max(1, Math.round(params.period || 20));
  const volumes = bars.map((b) => b.volume);
  const result: number[] = [];

  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += volumes[j];
    }
    result.push(sum / period);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stochastic Oscillator
// ---------------------------------------------------------------------------

function stochastic(
  bars: OHLCVBar[],
  params: Record<string, number>,
): Record<string, number[]> {
  const kPeriod = Math.max(1, Math.round(params.kPeriod || 14));
  const dPeriod = Math.max(1, Math.round(params.dPeriod || 3));
  const smoothK = Math.max(1, Math.round(params.smooth || 3));

  const rawK: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (i < kPeriod - 1) {
      rawK.push(NaN);
      continue;
    }
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (bars[j].high > highest) highest = bars[j].high;
      if (bars[j].low < lowest) lowest = bars[j].low;
    }
    const range = highest - lowest;
    if (range === 0) {
      rawK.push(50);
    } else {
      rawK.push(((bars[i].close - lowest) / range) * 100);
    }
  }

  // Smooth %K with SMA of length `smoothK`
  const smoothedK: number[] = [];
  for (let i = 0; i < rawK.length; i++) {
    if (isNaN(rawK[i])) {
      smoothedK.push(NaN);
      continue;
    }
    if (i < kPeriod - 1 + smoothK - 1) {
      // Not enough data to smooth yet — still push NaN
      // We need `smoothK` valid rawK values to produce the first smoothed value
      smoothedK.push(NaN);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = i - smoothK + 1; j <= i; j++) {
      if (!isNaN(rawK[j])) {
        sum += rawK[j];
        count++;
      }
    }
    smoothedK.push(count > 0 ? sum / count : NaN);
  }

  // %D = SMA of smoothed %K over dPeriod
  const dLine: number[] = [];
  const validStartK = smoothedK.findIndex((v) => !isNaN(v));

  for (let i = 0; i < smoothedK.length; i++) {
    if (isNaN(smoothedK[i]) || i < validStartK + dPeriod - 1) {
      dLine.push(NaN);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (!isNaN(smoothedK[j])) {
        sum += smoothedK[j];
        count++;
      }
    }
    dLine.push(count > 0 ? sum / count : NaN);
  }

  return { k: padStart(smoothedK, bars.length), d: padStart(dLine, bars.length) };
}

// ---------------------------------------------------------------------------
// Indicator Registry
// ---------------------------------------------------------------------------

export const INDICATORS: Record<string, IndicatorDefinition> = {
  SMA: {
    name: 'SMA',
    displayName: 'Simple Moving Average',
    description:
      'Calculates the arithmetic mean of prices over a specified period, smoothing out price data to identify trends.',
    parameters: [
      { name: 'period', defaultValue: 20, min: 1, max: 500, step: 1 },
    ],
    calculate: sma,
  },

  EMA: {
    name: 'EMA',
    displayName: 'Exponential Moving Average',
    description:
      'Places greater weight on recent prices, reacting faster to price changes than SMA.',
    parameters: [
      { name: 'period', defaultValue: 20, min: 1, max: 500, step: 1 },
    ],
    calculate: ema,
  },

  RSI: {
    name: 'RSI',
    displayName: 'Relative Strength Index',
    description:
      'Momentum oscillator that measures speed and magnitude of price changes. Values above 70 indicate overbought, below 30 oversold.',
    parameters: [
      { name: 'period', defaultValue: 14, min: 2, max: 100, step: 1 },
    ],
    calculate: rsi,
  },

  MACD: {
    name: 'MACD',
    displayName: 'MACD',
    description:
      'Moving Average Convergence Divergence — trend-following momentum indicator showing relationship between two EMAs.',
    parameters: [
      { name: 'fast', defaultValue: 12, min: 2, max: 100, step: 1 },
      { name: 'slow', defaultValue: 26, min: 2, max: 200, step: 1 },
      { name: 'signal', defaultValue: 9, min: 1, max: 50, step: 1 },
    ],
    calculate: macd,
  },

  BollingerBands: {
    name: 'BollingerBands',
    displayName: 'Bollinger Bands',
    description:
      'Volatility bands placed above and below a moving average. Bands widen when volatility increases and narrow when it decreases.',
    parameters: [
      { name: 'period', defaultValue: 20, min: 2, max: 200, step: 1 },
      { name: 'stdDev', defaultValue: 2, min: 0.1, max: 5, step: 0.1 },
    ],
    calculate: bollingerBands,
  },

  ATR: {
    name: 'ATR',
    displayName: 'Average True Range',
    description:
      'Measures market volatility by decomposing the entire range of a price over a period. Useful for setting stop-loss distances.',
    parameters: [
      { name: 'period', defaultValue: 14, min: 1, max: 100, step: 1 },
    ],
    calculate: atr,
  },

  Volume_MA: {
    name: 'Volume_MA',
    displayName: 'Volume Moving Average',
    description:
      'Simple moving average of volume, used to identify unusual volume activity relative to recent average.',
    parameters: [
      { name: 'period', defaultValue: 20, min: 1, max: 200, step: 1 },
    ],
    calculate: volumeMA,
  },

  Stochastic: {
    name: 'Stochastic',
    displayName: 'Stochastic Oscillator',
    description:
      'Compares a closing price to a range of prices over a period. Values above 80 indicate overbought, below 20 oversold.',
    parameters: [
      { name: 'kPeriod', defaultValue: 14, min: 1, max: 100, step: 1 },
      { name: 'dPeriod', defaultValue: 3, min: 1, max: 50, step: 1 },
      { name: 'smooth', defaultValue: 3, min: 1, max: 20, step: 1 },
    ],
    calculate: stochastic,
  },
};

// ---------------------------------------------------------------------------
// Public helper — look up indicator by name and calculate
// ---------------------------------------------------------------------------

/**
 * Calculate an indicator by name. Returns `number[]` for single-line indicators
 * or `Record<string, number[]>` for multi-line indicators (MACD, BollingerBands, Stochastic).
 */
export function calculateIndicator(
  name: string,
  bars: OHLCVBar[],
  params: Record<string, number>,
): number[] | Record<string, number[]> {
  const def = INDICATORS[name];
  if (!def) {
    throw new Error(`Unknown indicator: "${name}". Available: ${Object.keys(INDICATORS).join(', ')}`);
  }
  return def.calculate(bars, params);
}
