// ============================================================================// Finnhub Provider — https://finnhub.io/docs/api// ============================================================================

import { registerProvider, type LiveDataProvider, type LiveTick, type WsMessage } from './provider';
import type { OHLCVBar, Timeframe } from '@/types/trading';
import { TIMEFRAMES } from '@/types/trading';

// ---------------------------------------------------------------------------// Symbol mapping (OANDA:EUR_USD style for forex)// ---------------------------------------------------------------------------

const SYMBOL_MAP: Record<string, string> = {
  // US Stocks
  AAPL: 'AAPL',
  GOOGL: 'GOOGL',
  MSFT: 'MSFT',
  AMZN: 'AMZN',
  TSLA: 'TSLA',
  NVDA: 'NVDA',
  META: 'META',
  NFLX: 'NFLX',
  JPM: 'JPM',
  V: 'V',
  DIS: 'DIS',
  AMD: 'AMD',

  // Forex (OANDA prefix)
  'EUR/USD': 'OANDA:EUR_USD',
  'GBP/USD': 'OANDA:GBP_USD',
  'USD/JPY': 'OANDA:USD_JPY',
  'USD/CHF': 'OANDA:USD_CHF',
  'AUD/USD': 'OANDA:AUD_USD',
  'USD/CAD': 'OANDA:USD_CAD',
  'NZD/USD': 'OANDA:NZD_USD',
  'EUR/JPY': 'OANDA:EUR_JPY',
  'GBP/JPY': 'OANDA:GBP_JPY',
  'EUR/GBP': 'OANDA:EUR_GBP',
  'EUR/AUD': 'OANDA:EUR_AUD',
  'GBP/AUD': 'OANDA:GBP_AUD',

  // Crypto (BINANCE prefix)
  'BTC/USD': 'BINANCE:BTCUSDT',
  'ETH/USD': 'BINANCE:ETHUSDT',
  'SOL/USD': 'BINANCE:SOLUSDT',
  'BNB/USD': 'BINANCE:BNBUSDT',
  'XRP/USD': 'BINANCE:XRPUSDT',
};

// ---------------------------------------------------------------------------// Timeframe mapping (Finnhub uses minute counts)// ---------------------------------------------------------------------------

const TF_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1H': '60',
  '4H': '240',
  '1D': 'D',
  '1W': 'W',
  '1M': 'M',
};

// ---------------------------------------------------------------------------// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY is not set');
  return key;
}

// ---------------------------------------------------------------------------// Provider implementation
// ---------------------------------------------------------------------------

const finnhubProvider: LiveDataProvider = {
  name: 'finnhub',

  toProviderSymbol(symbol: string): string | null {
    return SYMBOL_MAP[symbol] ?? null;
  },

  hasLiveSupport(symbol: string): boolean {
    return symbol in SYMBOL_MAP;
  },

  toProviderResolution(timeframe: Timeframe): string {
    return TF_MAP[timeframe] ?? 'D';
  },

  getBarPeriodSeconds(timeframe: Timeframe): number {
    return TIMEFRAMES[timeframe]?.seconds ?? 86400;
  },

  async fetchHistoricalBars(
    symbol: string,
    timeframe: Timeframe,
    limit = 500,
    startDate?: string,
    endDate?: string,
  ): Promise<OHLCVBar[]> {
    const providerSymbol = this.toProviderSymbol(symbol);
    if (!providerSymbol) throw new Error(`No Finnhub mapping for symbol: ${symbol}`);

    const resolution = this.toProviderResolution(timeframe);
    const apiKey = getApiKey();
    const now = Math.floor(Date.now() / 1000);
    const from = startDate
      ? Math.floor(new Date(startDate).getTime() / 1000)
      : now - 86400 * 365;
    const to = endDate
      ? Math.floor(new Date(endDate).getTime() / 1000)
      : now;

    const params = new URLSearchParams({
      symbol: providerSymbol,
      resolution,
      from: String(from),
      to: String(to),
      token: apiKey,
    });

    const url = `https://finnhub.io/api/v1/stock/candle?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Finnhub API error ${res.status}: ${text}`);
    }

    const json = await res.json();

    if (json.s !== 'ok' || !json.t) {
      throw new Error(`Finnhub returned no data for ${symbol} (${resolution})`);
    }

    // Finnhub returns parallel arrays
    const bars: OHLCVBar[] = json.t.map((t: number, i: number) => ({
      time: t,
      open: json.o[i],
      high: json.h[i],
      low: json.l[i],
      close: json.c[i],
      volume: json.v[i],
    }));

    return bars.slice(-limit);
  },

  getWsUrl(): string {
    return `wss://ws.finnhub.io?token=${getApiKey()}`;
  },

  getWsMessages(symbol: string): WsMessage {
    const providerSymbol = this.toProviderSymbol(symbol);
    if (!providerSymbol) throw new Error(`No Finnhub mapping for symbol: ${symbol}`);

    return {
      subscribe: JSON.stringify({ type: 'subscribe', symbol: providerSymbol }),
      unsubscribe: JSON.stringify({ type: 'unsubscribe', symbol: providerSymbol }),
    };
  },

  parseWsMessage(raw: string): LiveTick | null {
    try {
      const msg = JSON.parse(raw);

      // Finnhub trade event
      if (msg.type === 'trade' && msg.data && msg.data.length > 0) {
        const trade = msg.data[msg.data.length - 1]; // latest trade
        return {
          symbol: trade.s,
          price: trade.p,
          volume: trade.v,
          timestamp: trade.t,
        };
      }

      return null;
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------// Auto-register
// ---------------------------------------------------------------------------

registerProvider(finnhubProvider);
