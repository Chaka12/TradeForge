'use client';

import { create } from 'zustand';
import { SimulationEngine } from '@/lib/engine/simulation';
import type {
  OHLCVBar,
  Order,
  Trade,
  AccountState,
  SimulationConfig,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimulationState {
  engine: SimulationEngine | null;
  isInitialized: boolean;
  accountState: AccountState | null;
  currentBar: OHLCVBar | null;
  pendingOrders: Order[];
  openTrades: Trade[];
  closedTrades: Trade[];
  allBars: OHLCVBar[];

  initialize: (bars: OHLCVBar[], config: SimulationConfig) => void;
  stepForward: () => void;
  stepBackward: () => void;
  seekTo: (time: number) => void;
  advanceToBar: (index: number) => void;
  placeOrder: (order: Omit<Order, 'id' | 'status' | 'filledQty' | 'filledAt'>) => Order;
  cancelOrder: (id: string) => void;
  closeTrade: (id: string, price?: number) => void;
  getAccountState: () => AccountState;
  destroy: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSimulationStore = create<SimulationState>((set, get) => ({
  engine: null,
  isInitialized: false,
  accountState: null,
  currentBar: null,
  pendingOrders: [],
  openTrades: [],
  closedTrades: [],
  allBars: [],

  initialize: (bars, config) => {
    const prev = get().engine;
    if (prev) {
      prev.destroy();
    }

    const engine = new SimulationEngine(bars, config);

    const resetDerivedLists = () => {
      set({
        pendingOrders: [],
        openTrades: [],
        closedTrades: [],
      });
    };

    // -- Event: barChange --
    // Fired on every bar advance AND at the end of a full replay (seekTo/stepBackward).
    // The callback signature is (barIndex: number, bar: OHLCVBar | null).
    const onBarChange = (_barIndex: number, bar: OHLCVBar | null) => {
      set({ currentBar: bar });
    };

    // -- Event: tradeOpen --
    const onTradeOpen = (trade: Trade) => {
      set((state) => ({
        openTrades: [...state.openTrades, trade],
      }));
    };

    // -- Event: tradeClose --
    const onTradeClose = (trade: Trade) => {
      set((state) => ({
        openTrades: state.openTrades.filter((t) => t.id !== trade.id),
        closedTrades: [...state.closedTrades, trade],
      }));
    };

    // -- Event: orderFilled --
    const onOrderFilled = (_order: Order) => {
      // When an order fills it is removed from pending automatically by the
      // engine. We don't need to update pendingOrders here because the order
      // was already in our list as pending and now it's filled — the next
      // full sync or barChange will clean it up. However for responsiveness
      // we remove it immediately.
      set((state) => ({
        pendingOrders: state.pendingOrders.filter(
          (o) => o.id !== (_order as Order).id,
        ),
      }));
    };

    // -- Event: orderCancelled --
    const onOrderCancelled = (order: Order) => {
      set((state) => ({
        pendingOrders: state.pendingOrders.filter((o) => o.id !== order.id),
      }));
    };

    // -- Event: accountUpdate --
    const onAccountUpdate = (account: AccountState) => {
      set({ accountState: account });
    };

    // Subscribe to all engine events
    engine.on('barChange', onBarChange);
    engine.on('tradeOpen', onTradeOpen);
    engine.on('tradeClose', onTradeClose);
    engine.on('orderFilled', onOrderFilled);
    engine.on('orderCancelled', onOrderCancelled);
    engine.on('accountUpdate', onAccountUpdate);

    // Store event handler references for cleanup
    const handlers = {
      barChange: onBarChange,
      tradeOpen: onTradeOpen,
      tradeClose: onTradeClose,
      orderFilled: onOrderFilled,
      orderCancelled: onOrderCancelled,
      accountUpdate: onAccountUpdate,
    };

    // Store on the engine instance for later destroy cleanup
    (engine as unknown as Record<string, unknown>).__storeHandlers = handlers;
    (engine as unknown as Record<string, unknown>).__resetDerivedLists = resetDerivedLists;

    set({
      engine,
      isInitialized: true,
      accountState: engine.getAccountState(),
      currentBar: engine.getCurrentBar(),
      allBars: engine.getAllBars(),
      pendingOrders: [],
      openTrades: [],
      closedTrades: [],
    });
  },

  stepForward: () => {
    const { engine } = get();
    if (!engine) return;

    // stepForward doesn't replay, so derived lists stay consistent
    engine.stepForward();
  },

  stepBackward: () => {
    const { engine } = get();
    if (!engine) return;

    // stepBackward triggers a full replay which resets internal state.
    // We must reset our derived lists before the replay fires events.
    const resetDerivedLists = (engine as unknown as Record<string, unknown>).__resetDerivedLists as (() => void) | undefined;
    if (resetDerivedLists) resetDerivedLists();

    engine.stepBackward();
  },

  seekTo: (time) => {
    const { engine } = get();
    if (!engine) return;

    // seekTo triggers a full replay — reset derived lists first.
    const resetDerivedLists = (engine as unknown as Record<string, unknown>).__resetDerivedLists as (() => void) | undefined;
    if (resetDerivedLists) resetDerivedLists();

    engine.seekTo(time);
  },

  advanceToBar: (index) => {
    const { engine } = get();
    if (!engine) return;
    engine.advanceToBar(index);
  },

  placeOrder: (order) => {
    const { engine } = get();
    if (!engine) throw new Error('Simulation engine not initialized');

    const placed = engine.placeOrder(order);

    // Only add to pending if the engine didn't immediately fill it
    // (market orders fill right away during replay)
    if (placed.status === 'pending') {
      set((state) => ({
        pendingOrders: [...state.pendingOrders, placed],
      }));
    }

    return placed;
  },

  cancelOrder: (id) => {
    const { engine } = get();
    if (!engine) return;
    engine.cancelOrder(id);
    // The engine emits 'orderCancelled' which updates pendingOrders
  },

  closeTrade: (id, price) => {
    const { engine } = get();
    if (!engine) return;
    engine.closeTrade(id, price);
    // The engine emits 'tradeClose' which updates openTrades/closedTrades
  },

  getAccountState: () => {
    const { engine, accountState } = get();
    if (!engine) {
      throw new Error('Simulation engine not initialized');
    }
    // Return cached state (updated on every accountUpdate event),
    // falling back to a fresh computation if somehow stale.
    return accountState ?? engine.getAccountState();
  },

  destroy: () => {
    const { engine } = get();
    if (engine) {
      const handlers = (engine as unknown as Record<string, unknown>).__storeHandlers as
        Record<string, (...args: unknown[]) => void>
        | undefined;

      if (handlers) {
        engine.off('barChange', handlers.barChange);
        engine.off('tradeOpen', handlers.tradeOpen);
        engine.off('tradeClose', handlers.tradeClose);
        engine.off('orderFilled', handlers.orderFilled);
        engine.off('orderCancelled', handlers.orderCancelled);
        engine.off('accountUpdate', handlers.accountUpdate);
      }

      engine.destroy();
    }

    set({
      engine: null,
      isInitialized: false,
      accountState: null,
      currentBar: null,
      pendingOrders: [],
      openTrades: [],
      closedTrades: [],
      allBars: [],
    });
  },
}));
