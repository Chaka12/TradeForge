// ============================================================================
// Live Data Provider Interface + Registry
// Swap providers by changing the LIVE_DATA_PROVIDER env var.
// ============================================================================

import type { OHLCVBar, Timeframe } from '@/types/trading';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed tick from a WebSocket message (provider-agnostic) */
export interface LiveTick {
  symbol: string;       // TradeForge symbol (e.g. 'EUR/USD')
  price: number;
  volume: number;
  timestamp: number;     // Unix seconds
}

/** Subscribe/unsubscribe message to send over WebSocket */
export interface WsMessage {
  subscribe: string;    // JSON string to send for subscribe
  unsubscribe: string;  // JSON string to send for unsubscribe
}

export interface LiveDataProvider {
  /** Provider name (matches LIVE_DATA_PROVIDER env var) */
  name: string;

  /** Map a TradeForge symbol (e.g. 'EUR/USD') to provider symbol format */
  toProviderSymbol(symbol: string): string | null;

  /** Check if a symbol has live data support */
  hasLiveSupport(symbol: string): boolean;

  /** Map a TradeForge timeframe to provider resolution string */
  toProviderResolution(timeframe: Timeframe): string;

  /** Get the bar period in seconds for a given timeframe */
  getBarPeriodSeconds(timeframe: Timeframe): number;

  /** Fetch historical OHLCV bars from the provider's REST API */
  fetchHistoricalBars(
    symbol: string,
    timeframe: Timeframe,
    limit?: number,
    startDate?: string,
    endDate?: string,
  ): Promise<OHLCVBar[]>;

  /** Return the WebSocket URL for streaming */
  getWsUrl(): string;

  /** Return subscribe/unsubscribe messages for a given symbol */
  getWsMessages(symbol: string): WsMessage;

  /**
   * Parse a raw WebSocket message into a LiveTick (or null if not a tick).
   * Each provider formats WS messages differently.
   */
  parseWsMessage(raw: string): LiveTick | null;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const providers = new Map<string, LiveDataProvider>();

/** Register a provider (called by each provider module on import) */
export function registerProvider(provider: LiveDataProvider): void {
  providers.set(provider.name, provider);
}

/** Get the active provider based on LIVE_DATA_PROVIDER env var */
export function getActiveProvider(): LiveDataProvider {
  const name = process.env.LIVE_DATA_PROVIDER || 'twelvedata';
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(
      `Unknown live data provider: "${name}". Available: ${[...providers.keys()].join(', ')}`,
    );
  }
  return provider;
}

/** List all registered provider names */
export function getRegisteredProviders(): string[] {
  return [...providers.keys()];
}
