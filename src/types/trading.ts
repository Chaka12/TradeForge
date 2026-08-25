// ============================================================================
// Core TypeScript Types for the Trading Simulator System
// ============================================================================

/** OHLCV bar data — all timestamps are Unix seconds (number) */
export interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Bar timeframe identifiers */
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '3H' | '4H' | '8H' | '12H' | '1D' | '1W' | '1M';

/** Order side */
export type OrderSide = 'buy' | 'sell';

/** Order type */
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';

/** Order lifecycle status */
export type OrderStatus = 'pending' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';

/** Trade lifecycle status */
export type TradeStatus = 'open' | 'closed';

/** Position direction */
export type PositionSide = 'long' | 'short';

/** Order entity */
export interface Order {
  id: string;
  accountId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number | null;
  stopPrice: number | null;
  status: OrderStatus;
  filledQty: number;
  createdAt: number;
  filledAt: number | null;
}

/** Trade entity */
export interface Trade {
  id: string;
  accountId: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  commission: number;
  pnl: number | null;
  status: TradeStatus;
  entryTime: number;
  exitTime: number | null;
}

/** Computed account state snapshot */
export interface AccountState {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  drawdown: number;
  drawdownPercent: number;
}

/** Simulation configuration */
export interface SimulationConfig {
  initialBalance: number;
  commission: number;
  slippage: number;
  startTime: number;
  endTime: number;
  speed: number;
}

/** Indicator parameter definition */
export interface IndicatorParameter {
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

/** Indicator definition with calculation function */
export interface IndicatorDefinition {
  name: string;
  displayName: string;
  description: string;
  parameters: IndicatorParameter[];
  calculate: (bars: OHLCVBar[], params: Record<string, number>) => number[] | Record<string, number[]>;
}

/** Computed indicator series for charting */
export interface IndicatorSeries {
  name: string;
  data: number[];
  color: string;
  style: 'line' | 'histogram' | 'area';
  pane: 'main' | 'sub';
}

/** Drawing tool types */
export type DrawingType =
  | 'trendline'
  | 'horizontal_line'
  | 'vertical_line'
  | 'rectangle'
  | 'fibonacci_retracement'
  | 'text'
  | 'channel'
  | 'risk_reward';

/** Drawing entity */
export interface Drawing {
  id: string;
  type: DrawingType;
  points: Array<{ time: number; price: number }>;
  color: string;
  lineWidth: number;
  style: string;
  text?: string;
  fibLevels?: Array<{ level: number; price: number }>;
  fill?: boolean;
  fillColor?: string;
  visibleTimeframes?: Timeframe[];  // empty = all timeframes
  createdAt: number;
  // R:R ratio fields
  rrRatio?: number;
  // Symbol this drawing was placed on (for persistence)
  symbol?: string;
  // Timeframe this drawing was placed on (for persistence)
  timeframe?: Timeframe;
}

/** Chart configuration */
export interface ChartConfig {
  symbol: string;
  timeframe: Timeframe;
  indicators: Array<{
    name: string;
    params: Record<string, number>;
    visible: boolean;
  }>;
  drawings: Drawing[];
  chartType: 'candlestick' | 'line' | 'area' | 'bar';
}

/** Timeframe metadata */
export interface TimeframeInfo {
  label: string;
  seconds: number;
  name: string;
}

/** Mapping of all supported timeframes to their metadata */
export const TIMEFRAMES: Record<Timeframe, TimeframeInfo> = {
  '1m':  { label: '1m',  seconds: 60,      name: '1 Minute' },
  '5m':  { label: '5m',  seconds: 300,     name: '5 Minutes' },
  '15m': { label: '15m', seconds: 900,     name: '15 Minutes' },
  '30m': { label: '30m', seconds: 1800,    name: '30 Minutes' },
  '1H':  { label: '1H',  seconds: 3600,    name: '1 Hour' },
  '3H':  { label: '3H',  seconds: 10800,   name: '3 Hours' },
  '4H':  { label: '4H',  seconds: 14400,   name: '4 Hours' },
  '8H':  { label: '8H',  seconds: 28800,   name: '8 Hours' },
  '12H': { label: '12H', seconds: 43200,   name: '12 Hours' },
  '1D':  { label: '1D',  seconds: 86400,   name: '1 Day' },
  '1W':  { label: '1W',  seconds: 604800,  name: '1 Week' },
  '1M':  { label: '1M',  seconds: 2592000, name: '1 Month' },
} as const;
