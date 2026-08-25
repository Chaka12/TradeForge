// ============================================================================
// Event-Driven Trading Simulation Engine
// ============================================================================
//
// Architecture:
// - The engine holds an immutable array of OHLCV bars and a mutable account state.
// - User actions (place order, cancel order, close trade) are recorded in an action
//   log along with the bar index at which they were initiated.
// - stepBackward() performs a full re-simulation from bar 0 up to the target index,
//   replaying only actions logged at or before the target bar. This ensures perfect
//   determinism without needing to store intermediate snapshots.
// - Order matching is evaluated against each bar's OHLC range.
//
// Accounting model (margin-based):
// - On entry: balance -= quantity * fillPrice + entryCommission
// - On exit:  balance += quantity * entryPrice + netPnl
//            where netPnl = (exitPrice - entryPrice) * qty - exitCommission
// - equity   = balance + margin + unrealizedPnl
//            = balance + Σ(entryPrice * qty) + Σ((currentPrice - entryPrice) * qty)
//            = balance + Σ(currentPrice * qty)
//
// ============================================================================

import type {
  OHLCVBar,
  Order,
  Trade,
  AccountState,
  SimulationConfig,
  PositionSide,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// Unique ID generator
// ---------------------------------------------------------------------------

let _idCounter = 0;
function generateId(): string {
  return `sim_${Date.now()}_${++_idCounter}`;
}

// ---------------------------------------------------------------------------
// Action log — records user-initiated actions for deterministic replay
// ---------------------------------------------------------------------------

interface PlaceOrderAction {
  type: 'placeOrder';
  barIndex: number;
  order: Order;
}

interface CancelOrderAction {
  type: 'cancelOrder';
  barIndex: number;
  orderId: string;
}

interface CloseTradeAction {
  type: 'closeTrade';
  barIndex: number;
  tradeId: string;
  price: number | undefined;
}

type ActionEntry = PlaceOrderAction | CancelOrderAction | CloseTradeAction;

// ---------------------------------------------------------------------------
// Internal types & helpers
// ---------------------------------------------------------------------------

function cloneOrder(o: Order): Order {
  return { ...o };
}

function cloneTrade(t: Trade): Trade {
  return { ...t };
}

interface InternalAccount {
  balance: number;
  trades: Trade[];
  orders: Order[];
  realizedPnl: number;
}

// ---------------------------------------------------------------------------
// SimulationEngine
// ---------------------------------------------------------------------------

export class SimulationEngine {
  private bars: OHLCVBar[];
  private currentIndex: number;
  private account: InternalAccount;
  private config: SimulationConfig;
  private listeners: Map<string, Set<(...args: unknown[]) => void>>;
  private actionLog: ActionEntry[];
  private peakEquity: number;
  private destroyed: boolean;

  constructor(bars: OHLCVBar[], config: SimulationConfig) {
    this.bars = bars;
    this.config = config;
    this.currentIndex = -1;
    this.peakEquity = config.initialBalance;
    this.destroyed = false;
    this.listeners = new Map();
    this.actionLog = [];

    this.account = {
      balance: config.initialBalance,
      trades: [],
      orders: [],
      realizedPnl: 0,
    };
  }

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  /** Process bars from current position up to (and including) `index`. */
  advanceToBar(index: number): void {
    this.ensureAlive();
    const target = Math.max(-1, Math.min(index, this.bars.length - 1));

    while (this.currentIndex < target) {
      this.currentIndex++;
      this.processBar(this.currentIndex);
      this.emit('barChange', this.currentIndex, this.getCurrentBar());
    }
  }

  /** Advance one bar forward. */
  stepForward(): void {
    this.ensureAlive();
    if (this.currentIndex < this.bars.length - 1) {
      this.advanceToBar(this.currentIndex + 1);
    }
  }

  /** Go back one bar — full re-simulation from bar 0. */
  stepBackward(): void {
    this.ensureAlive();
    if (this.currentIndex <= -1) return;
    this.seekTo(this.bars[this.currentIndex - 1]?.time ?? -Infinity);
  }

  /** Jump to the bar whose time is <= `time`. Performs full re-simulation. */
  seekTo(time: number): void {
    this.ensureAlive();
    let targetIndex = -1;
    for (let i = 0; i < this.bars.length; i++) {
      if (this.bars[i].time <= time) {
        targetIndex = i;
      } else {
        break;
      }
    }
    this.replayTo(targetIndex);
  }

  // -----------------------------------------------------------------------
  // Order management
  // -----------------------------------------------------------------------

  /**
   * Place a new order. Market orders fill at the open of the next bar.
   * Limit/stop orders are evaluated against subsequent bar OHLC ranges.
   */
  placeOrder(order: Omit<Order, 'id' | 'status' | 'filledQty' | 'filledAt'>): Order {
    this.ensureAlive();
    const fullOrder: Order = {
      ...order,
      id: generateId(),
      status: 'pending',
      filledQty: 0,
      filledAt: null,
    };

    // Record the action so replay can reconstruct it
    this.actionLog.push({
      type: 'placeOrder',
      barIndex: this.currentIndex,
      order: cloneOrder(fullOrder),
    });

    this.account.orders.push(cloneOrder(fullOrder));

    // Immediately try to match against the current bar so market orders
    // fill right away (critical for replay / rewind mode where the user
    // expects the entry to appear on the currently visible bar).
    const currentBar = this.getCurrentBar();
    if (currentBar) {
      this.matchOrders(currentBar);
      this.checkStopLossAndTakeProfit(currentBar);
      this.emit('accountUpdate', this.getAccountState());
    }

    return cloneOrder(fullOrder);
  }

  /** Cancel a pending order by ID. */
  cancelOrder(orderId: string): void {
    this.ensureAlive();
    const order = this.account.orders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.status !== 'pending') return;

    order.status = 'cancelled';

    this.actionLog.push({
      type: 'cancelOrder',
      barIndex: this.currentIndex,
      orderId,
    });

    this.emit('orderCancelled', cloneOrder(order));
  }

  /** Close an open trade, optionally at a specific price. */
  closeTrade(tradeId: string, price?: number): void {
    this.ensureAlive();
    const trade = this.account.trades.find((t) => t.id === tradeId);
    if (!trade || trade.status !== 'open') return;

    const bar = this.getCurrentBar();
    const closePrice = price ?? bar?.close ?? trade.entryPrice;

    this.executeCloseTrade(trade, closePrice);
    this.emit('tradeClose', cloneTrade(trade));

    this.actionLog.push({
      type: 'closeTrade',
      barIndex: this.currentIndex,
      tradeId,
      price,
    });
  }

  // -----------------------------------------------------------------------
  // Account state queries
  // -----------------------------------------------------------------------

  /** Compute a full account state snapshot at the current bar. */
  getAccountState(): AccountState {
    const bar = this.getCurrentBar();
    const currentPrice = bar?.close ?? 0;

    let unrealizedPnl = 0;
    let margin = 0;

    for (const trade of this.account.trades) {
      if (trade.status !== 'open') continue;
      const priceDiff = currentPrice - trade.entryPrice;
      const tradePnl =
        trade.side === 'long'
          ? priceDiff * trade.quantity
          : -priceDiff * trade.quantity;
      unrealizedPnl += tradePnl;
      margin += trade.entryPrice * trade.quantity;
    }

    // equity = balance (cash after removing position cost) + margin (locked) + unrealizedPnl
    const equity = this.account.balance + margin + unrealizedPnl;
    const freeMargin = equity - margin;

    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }

    const drawdown = Math.max(0, this.peakEquity - equity);
    const drawdownPercent =
      this.peakEquity > 0 ? (drawdown / this.peakEquity) * 100 : 0;

    return {
      balance: this.account.balance,
      equity,
      margin,
      freeMargin,
      unrealizedPnl,
      realizedPnl: this.account.realizedPnl,
      drawdown,
      drawdownPercent,
    };
  }

  /** Current bar, or null if before the first bar. */
  getCurrentBar(): OHLCVBar | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.bars.length) return null;
    return this.bars[this.currentIndex];
  }

  /** Full index range of all bars. */
  getVisibleRange(): { start: number; end: number } {
    return { start: 0, end: this.bars.length - 1 };
  }

  /** Return all bars. */
  getAllBars(): OHLCVBar[] {
    return this.bars;
  }

  /** Return bars from the beginning up to and including the current index. */
  getVisibleBars(): OHLCVBar[] {
    if (this.currentIndex < 0) return [];
    return this.bars.slice(0, this.currentIndex + 1);
  }

  // -----------------------------------------------------------------------
  // Event system
  // -----------------------------------------------------------------------

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: unknown[]): void {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    const callbacks = Array.from(cbs);
    for (let i = 0; i < callbacks.length; i++) {
      try {
        callbacks[i](...args);
      } catch (e) {
        console.error(
          `[SimulationEngine] Error in listener for '${event}':`,
          e,
        );
      }
    }
  }

  /** Tear down the engine, releasing all listeners and action history. */
  destroy(): void {
    this.destroyed = true;
    this.listeners.clear();
    this.actionLog.length = 0;
  }

  // -----------------------------------------------------------------------
  // Internal: bar processing pipeline
  // -----------------------------------------------------------------------

  /**
   * Process a single bar in order:
   * 1. Replay any user actions logged at this index (placeOrder, cancelOrder)
   * 2. Check SL/TP on all open trades
   * 3. Match pending orders against the bar's OHLC range
   * 4. Replay closeTrade actions logged at this index (user-initiated closes)
   * 5. Emit accountUpdate
   */
  private processBar(index: number): void {
    const bar = this.bars[index];

    // Phase 1 — apply user-initiated placeOrder / cancelOrder at this bar
    this.applyEntryActionsAtBar(index);

    // Phase 2 — check SL/TP
    this.checkStopLossAndTakeProfit(bar);

    // Phase 3 — match pending orders
    this.matchOrders(bar);

    // Phase 4 — apply user-initiated closeTrade at this bar
    this.applyCloseActionsAtBar(index);

    // Phase 5 — notify
    this.emit('accountUpdate', this.getAccountState());
  }

  // -----------------------------------------------------------------------
  // Action replay helpers
  // -----------------------------------------------------------------------

  /** Replay placeOrder and cancelOrder actions for a given bar index. */
  private applyEntryActionsAtBar(index: number): void {
    for (const action of this.actionLog) {
      if (action.barIndex !== index) continue;
      if (action.type === 'placeOrder') {
        const exists = this.account.orders.some((o) => o.id === action.order.id);
        if (!exists) {
          this.account.orders.push(cloneOrder(action.order));
        }
      } else if (action.type === 'cancelOrder') {
        const order = this.account.orders.find((o) => o.id === action.orderId);
        if (order && order.status === 'pending') {
          order.status = 'cancelled';
        }
      }
    }
  }

  /** Replay closeTrade actions for a given bar index. */
  private applyCloseActionsAtBar(index: number): void {
    for (const action of this.actionLog) {
      if (action.type !== 'closeTrade' || action.barIndex !== index) continue;
      const trade = this.account.trades.find((t) => t.id === action.tradeId);
      if (trade && trade.status === 'open') {
        const bar = this.bars[index];
        const closePrice = action.price ?? bar?.close ?? trade.entryPrice;
        this.executeCloseTrade(trade, closePrice);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Stop-loss / take-profit evaluation
  // -----------------------------------------------------------------------

  private checkStopLossAndTakeProfit(bar: OHLCVBar): void {
    const openTrades = this.account.trades.filter((t) => t.status === 'open');

    for (const trade of openTrades) {
      let closePrice: number | null = null;

      if (trade.side === 'long') {
        // SL hit when low drops to or below stopLoss
        if (trade.stopLoss !== null && bar.low <= trade.stopLoss) {
          closePrice = trade.stopLoss;
        }
        // TP hit when high reaches or exceeds takeProfit
        if (trade.takeProfit !== null && bar.high >= trade.takeProfit) {
          closePrice = trade.takeProfit;
        }
      } else {
        // Short: SL hit when high reaches or exceeds stopLoss
        if (trade.stopLoss !== null && bar.high >= trade.stopLoss) {
          closePrice = trade.stopLoss;
        }
        // TP hit when low drops to or below takeProfit
        if (trade.takeProfit !== null && bar.low <= trade.takeProfit) {
          closePrice = trade.takeProfit;
        }
      }

      if (closePrice !== null) {
        this.executeCloseTrade(trade, closePrice);
        this.emit('tradeClose', cloneTrade(trade));
      }
    }
  }

  // -----------------------------------------------------------------------
  // Order matching
  // -----------------------------------------------------------------------

  private matchOrders(bar: OHLCVBar): void {
    // Snapshot pending orders to avoid mutation during iteration
    const pending = this.account.orders.filter((o) => o.status === 'pending');

    for (const order of pending) {
      const { side, type, price: orderPrice, stopPrice } = order;
      let fillPrice: number | null = null;
      let shouldFill = false;

      switch (type) {
        case 'market': {
          // Market orders fill at the close of this bar (+ slippage)
          // This ensures the entry marker appears on the bar the user sees
          fillPrice =
            side === 'buy'
              ? bar.close + this.config.slippage
              : bar.close - this.config.slippage;
          shouldFill = true;
          break;
        }

        case 'limit': {
          if (orderPrice === null) break;
          // Buy limit: triggers when bar's low <= limit price
          if (side === 'buy' && bar.low <= orderPrice) {
            fillPrice = orderPrice;
            shouldFill = true;
          }
          // Sell limit: triggers when bar's high >= limit price
          if (side === 'sell' && bar.high >= orderPrice) {
            fillPrice = orderPrice;
            shouldFill = true;
          }
          break;
        }

        case 'stop': {
          if (stopPrice === null) break;
          // Buy stop: triggers when bar's high >= stop price
          if (side === 'buy' && bar.high >= stopPrice) {
            fillPrice = stopPrice + this.config.slippage;
            shouldFill = true;
          }
          // Sell stop: triggers when bar's low <= stop price
          if (side === 'sell' && bar.low <= stopPrice) {
            fillPrice = stopPrice - this.config.slippage;
            shouldFill = true;
          }
          break;
        }

        case 'stop_limit': {
          if (stopPrice === null || orderPrice === null) break;
          // Step 1: check if stop is triggered
          let stopTriggered = false;
          if (side === 'buy' && bar.high >= stopPrice) stopTriggered = true;
          if (side === 'sell' && bar.low <= stopPrice) stopTriggered = true;

          if (stopTriggered) {
            // Step 2: check if limit can be filled within this bar
            if (side === 'buy' && bar.low <= orderPrice) {
              fillPrice = orderPrice;
              shouldFill = true;
            }
            if (side === 'sell' && bar.high >= orderPrice) {
              fillPrice = orderPrice;
              shouldFill = true;
            }
          }
          break;
        }
      }

      if (shouldFill && fillPrice !== null && fillPrice > 0) {
        this.fillOrder(order, fillPrice, bar.time);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Fill logic
  // -----------------------------------------------------------------------

  private fillOrder(order: Order, fillPrice: number, timestamp: number): void {
    order.status = 'filled';
    order.filledQty = order.quantity;
    order.filledAt = timestamp;

    const entryCommission = this.config.commission * order.quantity * fillPrice;

    // If there is an opposing open position, close it first
    const positionSide: PositionSide = order.side === 'buy' ? 'long' : 'short';
    const opposingTrade = this.account.trades.find(
      (t) =>
        t.symbol === order.symbol &&
        t.status === 'open' &&
        t.side !== positionSide,
    );

    if (opposingTrade) {
      this.executeCloseTrade(opposingTrade, fillPrice);
      this.emit('tradeClose', cloneTrade(opposingTrade));
    }

    // Deduct full position cost + entry commission from balance
    const positionCost = order.quantity * fillPrice;
    this.account.balance -= positionCost + entryCommission;
    this.account.realizedPnl -= entryCommission;

    // Create the new trade
    const trade: Trade = {
      id: generateId(),
      accountId: order.accountId,
      symbol: order.symbol,
      side: positionSide,
      quantity: order.quantity,
      entryPrice: fillPrice,
      exitPrice: null,
      stopLoss: null,
      takeProfit: null,
      commission: entryCommission,
      pnl: null,
      status: 'open',
      entryTime: timestamp,
      exitTime: null,
    };

    this.account.trades.push(trade);

    this.emit('tradeOpen', cloneTrade(trade));
    this.emit('orderFilled', cloneOrder(order));
  }

  // -----------------------------------------------------------------------
  // Close trade logic
  // -----------------------------------------------------------------------

  /**
   * Close a trade at the given price.
   * Credits balance with: entryCost + netPnl
   *   where netPnl = (exitPrice - entryPrice) * qty * direction - exitCommission
   */
  private executeCloseTrade(trade: Trade, closePrice: number): void {
    if (trade.status !== 'open') return;

    trade.status = 'closed';
    trade.exitPrice = closePrice;
    trade.exitTime =
      this.bars[this.currentIndex]?.time ?? Math.floor(Date.now() / 1000);

    const direction = trade.side === 'long' ? 1 : -1;
    const grossPnl = (closePrice - trade.entryPrice) * trade.quantity * direction;
    const exitCommission = this.config.commission * trade.quantity * closePrice;
    const netPnl = grossPnl - exitCommission;

    trade.pnl = netPnl;
    trade.commission += exitCommission;

    // Credit back: the locked margin (entryPrice * qty) plus net profit/loss
    this.account.balance += trade.quantity * trade.entryPrice + netPnl;
    this.account.realizedPnl += netPnl;
  }

  // -----------------------------------------------------------------------
  // Full re-simulation from bar 0
  // -----------------------------------------------------------------------

  private replayTo(targetIndex: number): void {
    // Reset all mutable state
    this.account = {
      balance: this.config.initialBalance,
      trades: [],
      orders: [],
      realizedPnl: 0,
    };
    this.peakEquity = this.config.initialBalance;
    this.currentIndex = -1;

    // Replay bars one by one
    while (this.currentIndex < targetIndex) {
      this.currentIndex++;
      this.processBar(this.currentIndex);
    }

    this.emit('barChange', this.currentIndex, this.getCurrentBar());
    this.emit('accountUpdate', this.getAccountState());
  }

  // -----------------------------------------------------------------------
  // Guard
  // -----------------------------------------------------------------------

  private ensureAlive(): void {
    if (this.destroyed) {
      throw new Error('SimulationEngine has been destroyed');
    }
  }
}
