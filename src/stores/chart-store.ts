'use client';

import { create } from 'zustand';
import type { OHLCVBar, Drawing, DrawingType, Timeframe } from '@/types/trading';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IndicatorState {
  params: Record<string, number>;
  visible: boolean;
  colors: Record<string, string>;  // per-subkey colors override
}

export interface BarColors {
  upColor: string;
  downColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
}

interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  chartType: 'candle' | 'line' | 'bar';
  bars: OHLCVBar[];
  currentBarIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  indicators: Map<string, IndicatorState>;
  drawings: Drawing[];
  selectedDrawingId: string | null;
  activeDrawingTool: DrawingType | null;
  volumeVisible: boolean;
  crosshairVisible: boolean;
  barColors: BarColors;
  isRewindMode: boolean;

  // Symbol / timeframe / chart type
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  setChartType: (t: 'candle' | 'line' | 'bar') => void;

  // Bars / navigation
  setBars: (bars: OHLCVBar[]) => void;
  setCurrentBarIndex: (i: number) => void;

  // Playback
  setIsPlaying: (p: boolean) => void;
  setPlaybackSpeed: (s: number) => void;

  // Indicators
  addIndicator: (name: string, params: Record<string, number>) => void;
  removeIndicator: (name: string) => void;
  toggleIndicator: (name: string) => void;
  updateIndicatorParams: (name: string, params: Record<string, number>) => void;
  updateIndicatorColor: (name: string, subKey: string, color: string) => void;

  // Drawings
  addDrawing: (drawing: Drawing) => void;
  removeDrawing: (id: string) => void;
  updateDrawing: (id: string, updates: Partial<Drawing>) => void;
  clearDrawings: () => void;
  setSelectedDrawingId: (id: string | null) => void;

  // Drawing tool
  setActiveDrawingTool: (tool: DrawingType | null) => void;

  // Visibility toggles
  setVolumeVisible: (v: boolean) => void;
  setCrosshairVisible: (v: boolean) => void;

  // Bar colors
  setBarColors: (colors: Partial<BarColors>) => void;
  resetBarColors: () => void;

  // Rewind mode
  setIsRewindMode: (v: boolean) => void;

  // Persistence
  persistDrawings: () => void;
  loadDrawings: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_BAR_COLORS: BarColors = {
  upColor: '#10b981',
  downColor: '#ef4444',
  borderUpColor: '#10b981',
  borderDownColor: '#ef4444',
  wickUpColor: '#10b981',
  wickDownColor: '#ef4444',
};

// ---------------------------------------------------------------------------
// localStorage persistence helpers — TradingView-style global storage
// ---------------------------------------------------------------------------

const DRAWINGS_STORAGE_KEY = 'tradeforge_all_drawings';

function saveAllDrawingsToStorage(drawings: Drawing[]) {
  try {
    localStorage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(drawings));
  } catch { /* localStorage not available */ }
}

function loadAllDrawingsFromStorage(): Drawing[] {
  try {
    const stored = localStorage.getItem(DRAWINGS_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Drawing[];
  } catch { /* */ }
  return [];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChartStore = create<ChartState>((set, get) => ({
  symbol: 'AAPL',
  timeframe: '1D',
  chartType: 'candle',
  bars: [],
  currentBarIndex: -1,
  isPlaying: false,
  playbackSpeed: 1,
  indicators: new Map(),
  drawings: [],
  selectedDrawingId: null,
  activeDrawingTool: null,
  volumeVisible: true,
  crosshairVisible: true,
  barColors: { ...DEFAULT_BAR_COLORS },
  isRewindMode: false,

  // -- Symbol / timeframe / chart type --

  setSymbol: (s) => {
    // Persist all drawings before switching
    get().persistDrawings();
    set({ symbol: s });
    // Reload all drawings (they're global)
    get().loadDrawings();
  },

  setTimeframe: (t) => {
    // Persist all drawings before switching
    get().persistDrawings();
    set({ timeframe: t });
    // Reload all drawings (they're global — visibleTimeframes controls visibility)
    get().loadDrawings();
  },

  setChartType: (t) => set({ chartType: t }),

  // -- Bars / navigation --

  setBars: (bars) => set({ bars }),

  setCurrentBarIndex: (i) => set({ currentBarIndex: i }),

  // -- Playback --

  setIsPlaying: (p) => set({ isPlaying: p }),

  setPlaybackSpeed: (s) => set({ playbackSpeed: Math.max(1, Math.min(50, s)) }),

  // -- Indicators --

  addIndicator: (name, params) =>
    set((state) => {
      const next = new Map(state.indicators);
      next.set(name, { params: { ...params }, visible: true, colors: {} });
      return { indicators: next };
    }),

  removeIndicator: (name) =>
    set((state) => {
      const next = new Map(state.indicators);
      next.delete(name);
      return { indicators: next };
    }),

  toggleIndicator: (name) =>
    set((state) => {
      const next = new Map(state.indicators);
      const entry = next.get(name);
      if (entry) {
        next.set(name, { ...entry, visible: !entry.visible });
      }
      return { indicators: next };
    }),

  updateIndicatorParams: (name, params) =>
    set((state) => {
      const next = new Map(state.indicators);
      const entry = next.get(name);
      if (entry) {
        next.set(name, { ...entry, params: { ...params } });
      }
      return { indicators: next };
    }),

  updateIndicatorColor: (name, subKey, color) =>
    set((state) => {
      const next = new Map(state.indicators);
      const entry = next.get(name);
      if (entry) {
        next.set(name, { ...entry, colors: { ...entry.colors, [subKey]: color } });
      }
      return { indicators: next };
    }),

  // -- Drawings --

  addDrawing: (drawing) =>
    set((state) => ({ drawings: [...state.drawings, drawing] })),

  removeDrawing: (id) =>
    set((state) => ({
      drawings: state.drawings.filter((d) => d.id !== id),
      selectedDrawingId: state.selectedDrawingId === id ? null : state.selectedDrawingId,
    })),

  updateDrawing: (id, updates) =>
    set((state) => ({
      drawings: state.drawings.map((d) =>
        d.id === id ? { ...d, ...updates } : d,
      ),
    })),

  clearDrawings: () => {
    set({ drawings: [], selectedDrawingId: null });
    // Clear all persisted drawings
    try {
      localStorage.removeItem(DRAWINGS_STORAGE_KEY);
    } catch { /* */ }
  },

  setSelectedDrawingId: (id) => set({ selectedDrawingId: id }),

  // -- Drawing tool --

  setActiveDrawingTool: (tool) => set({ activeDrawingTool: tool, selectedDrawingId: null }),

  // -- Visibility toggles --

  setVolumeVisible: (v) => set({ volumeVisible: v }),

  setCrosshairVisible: (v) => set({ crosshairVisible: v }),

  // -- Bar colors --

  setBarColors: (colors) =>
    set((state) => ({ barColors: { ...state.barColors, ...colors } })),

  resetBarColors: () => set({ barColors: { ...DEFAULT_BAR_COLORS } }),

  // -- Rewind mode --

  setIsRewindMode: (v) => set({ isRewindMode: v, isPlaying: false }),

  // -- Persistence --

  persistDrawings: () => {
    const { drawings } = get();
    saveAllDrawingsToStorage(drawings);
  },

  loadDrawings: () => {
    // Load ALL drawings globally (TradingView-style)
    // visibleTimeframes on each drawing controls per-timeframe visibility
    const allStored = loadAllDrawingsFromStorage();
    if (allStored.length > 0) {
      set({ drawings: allStored });
    }
  },
}));
