'use client';

import { useState, useCallback } from 'react';
import {
  BarChart3, List, Wallet, Activity, BookOpen, Search, CandlestickChart, Pencil,
  Server,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { useAppStore, type SidebarTab } from '@/stores/app-store';
import { useChartStore, type BarColors } from '@/stores/chart-store';
import { PositionsPanel } from './PositionsPanel';
import { OrdersPanel } from './OrdersPanel';
import { AccountPanel } from './AccountPanel';
import { BrokerPanel } from './BrokerPanel';
import { INDICATORS } from '@/lib/engine/indicators';
import { TIMEFRAMES, type Timeframe, type Drawing } from '@/types/trading';
import { SEED_SYMBOLS } from '@/lib/engine/data-generator';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

interface TabDef {
  key: SidebarTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { key: 'symbols', label: 'Symbols', icon: Search },
  { key: 'positions', label: 'Positions', icon: BarChart3 },
  { key: 'orders', label: 'Orders', icon: List },
  { key: 'account', label: 'Account', icon: Wallet },
  { key: 'indicators', label: 'Indicators', icon: Activity },
  { key: 'drawings', label: 'Drawings', icon: Pencil },
  { key: 'broker', label: 'Broker', icon: Server },
  { key: 'journal', label: 'Journal', icon: BookOpen },
];

const ALL_SYMBOLS = SEED_SYMBOLS.map((s) => s.symbol);

function getSymbolCategory(s: string): string {
  const config = SEED_SYMBOLS.find((c) => c.symbol === s);
  return config?.category ?? 'Stocks';
}

// ---------------------------------------------------------------------------
// Symbols tab
// ---------------------------------------------------------------------------

function SymbolsTab() {
  const [search, setSearch] = useState('');
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const addToast = useAppStore((s) => s.addToast);
  const theme = useAppStore((s) => s.theme);

  const handleSelect = useCallback(async (s: string) => {
    setSymbol(s);
    useChartStore.getState().setIsRewindMode(false);
    try {
      const res = await fetch(`/api/bars?symbol=${encodeURIComponent(s)}&timeframe=${timeframe}&limit=5000`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        useChartStore.getState().setBars(json.data);
        useChartStore.getState().setCurrentBarIndex(0);
      }
    } catch { addToast(`Failed to load ${s}`, 'error'); }
  }, [setSymbol, timeframe, addToast]);

  const filtered = search.length > 0 ? ALL_SYMBOLS.filter((s) => s.toLowerCase().includes(search.toLowerCase())) : ALL_SYMBOLS;
  const grouped: Record<string, string[]> = {};
  for (const s of filtered) { const cat = getSymbolCategory(s); if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(s); }

  return (
    <div className="flex flex-col">
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-500" />
          <Input placeholder="Search symbols..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs" style={{ background: theme === 'light' ? '#f9fafb' : '#0d0d14', borderColor: theme === 'light' ? '#d1d5db' : '#2a2a4a', color: theme === 'light' ? '#111827' : '#e5e7eb' }} />
        </div>
      </div>
      <div className="flex flex-col">
        {Object.entries(grouped).map(([cat, syms]) => (
          <div key={cat}>
            <div className="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider" style={{ borderBottom: `1px solid ${theme === 'light' ? '#e5e7eb' : '#1e1e3a'}` }}>{cat}</div>
            {syms.map((s) => (
              <button key={s} onClick={() => handleSelect(s)}
                className={cn('w-full text-left px-3 py-2 text-sm transition-colors', s === symbol ? 'text-emerald-400' : theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-white/5')}
                style={s === symbol ? { background: 'rgba(16,185,129,0.08)' } : undefined}>
                <span className="font-mono font-medium">{s}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawings tab
// ---------------------------------------------------------------------------

function DrawingsTab() {
  const drawings = useChartStore((s) => s.drawings);
  const selectedDrawingId = useChartStore((s) => s.selectedDrawingId);
  const updateDrawing = useChartStore((s) => s.updateDrawing);
  const removeDrawing = useChartStore((s) => s.removeDrawing);
  const setSelectedDrawingId = useChartStore((s) => s.setSelectedDrawingId);
  const theme = useAppStore((s) => s.theme);

  if (drawings.length === 0) {
    return (
      <div className="px-3 py-10 flex flex-col items-center justify-center gap-3">
        <CandlestickChart className="h-8 w-8 text-gray-600" />
        <p className="text-xs text-gray-500 text-center">No drawings yet. Use the toolbar to place shapes on the chart.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {drawings.map((d) => {
        const isSelected = d.id === selectedDrawingId;
        const isRR = d.type === 'risk_reward';
        const tfLabel = isRR ? 'All TFs' : (d.timeframe || '—');
        return (
          <div key={d.id} className={cn('px-3 py-2 transition-colors', isSelected ? 'bg-blue-500/10' : theme === 'light' ? 'hover:bg-gray-50' : 'hover:bg-white/5')} style={{ borderBottom: `1px solid ${theme === 'light' ? '#e5e7eb' : '#1e1e3a'}` }}>
            <div className="flex items-center justify-between">
              <button className="text-xs font-medium text-gray-200 text-left flex-1" onClick={() => setSelectedDrawingId(isSelected ? null : d.id)}>
                {d.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded ml-1', isRR ? 'bg-cyan-600/20 text-cyan-400' : 'bg-gray-800 text-gray-500')}>{tfLabel}</span>
              <button className="text-gray-500 hover:text-red-400 text-xs ml-2" onClick={() => removeDrawing(d.id)}>Del</button>
            </div>
            {/* Color + Line Width */}
            <div className="flex items-center gap-2 mt-1.5">
              <Label className="text-[10px] text-gray-500 w-10">Color</Label>
              <input type="color" value={d.color} onChange={(e) => updateDrawing(d.id, { color: e.target.value })}
                className="w-6 h-6 rounded border border-gray-600 cursor-pointer bg-transparent p-0" />
              <div className="flex-1" />
              <Label className="text-[10px] text-gray-500">Width</Label>
              <input type="number" min={1} max={8} value={d.lineWidth} onChange={(e) => updateDrawing(d.id, { lineWidth: Math.max(1, Math.min(8, parseInt(e.target.value) || 1)) })}
                className="w-10 h-5 text-[10px] text-center bg-gray-800 border border-gray-700 rounded text-gray-300" />
              {/* Line style */}
              {d.type !== 'horizontal_line' && d.type !== 'vertical_line' && (
                <>
                  <div className="flex-1" />
                  <button className={cn('text-[9px] px-1.5 py-0.5 rounded', d.style === 'dashed' ? 'bg-blue-600/30 text-blue-400' : 'bg-gray-800 text-gray-500')}
                    onClick={() => updateDrawing(d.id, { style: d.style === 'dashed' ? 'solid' : 'dashed' })}>Dash</button>
                </>
              )}
              {/* Fill (for rectangle) */}
              {d.type === 'rectangle' && (
                <>
                  <div className="flex-1" />
                  <Checkbox checked={d.fill ?? false} onCheckedChange={(v) => updateDrawing(d.id, { fill: !!v })} className="mr-1" />
                  <Label className="text-[10px] text-gray-400">Fill</Label>
                  {(d.fill) && (
                    <input type="color" value={d.fillColor || d.color} onChange={(e) => updateDrawing(d.id, { fillColor: e.target.value })}
                      className="w-6 h-6 rounded border border-gray-600 cursor-pointer bg-transparent p-0 ml-1" />
                  )}
                </>
              )}
            </div>
            {/* Text content editing */}
            {d.type === 'text' && (
              <div className="flex items-center gap-2 mt-1.5">
                <Label className="text-[10px] text-gray-500 w-10">Text</Label>
                <input
                  type="text"
                  value={d.text || ''}
                  onChange={(e) => updateDrawing(d.id, { text: e.target.value })}
                  className="flex-1 h-5 text-[10px] text-gray-300 bg-gray-800 border border-gray-700 rounded px-1.5"
                />
              </div>
            )}
            {/* R:R ratio display */}
            {d.type === 'risk_reward' && (
              <div className="flex items-center gap-2 mt-1.5">
                <Label className="text-[10px] text-gray-500 w-10">R:R</Label>
                <span className="text-[11px] font-bold text-cyan-400">{(d.rrRatio ?? 0).toFixed(1)}</span>
                <span className="text-[9px] text-gray-600 ml-auto">Persists across all timeframes</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicators tab with color pickers
// ---------------------------------------------------------------------------

const INDICATOR_COLOR_KEYS: Record<string, string[]> = {
  SMA: ['line'], EMA: ['line'], RSI: ['line'], ATR: ['line'], Volume_MA: ['line'],
  MACD: ['macd', 'signal', 'histogram_up', 'histogram_down'],
  BollingerBands: ['upper', 'middle', 'lower'],
  Stochastic: ['k', 'd'],
};

const DEFAULT_COLORS: Record<string, Record<string, string>> = {
  SMA: { line: '#f59e0b' }, EMA: { line: '#a855f7' }, RSI: { line: '#06b6d4' },
  MACD: { macd: '#f59e0b', signal: '#f97316', histogram_up: '#10b981', histogram_down: '#ef4444' },
  BollingerBands: { upper: '#ef4444', middle: '#f59e0b', lower: '#22c55e' },
  ATR: { line: '#ec4899' }, Volume_MA: { line: '#a855f7' }, Stochastic: { k: '#06b6d4', d: '#f97316' },
};

function IndicatorsTab() {
  const indicators = useChartStore((s) => s.indicators);
  const addIndicator = useChartStore((s) => s.addIndicator);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleIndicator = useChartStore((s) => s.toggleIndicator);
  const updateIndicatorColor = useChartStore((s) => s.updateIndicatorColor);

  const handleToggle = (name: string) => {
    if (indicators.has(name)) { toggleIndicator(name); }
    else {
      const def = INDICATORS[name]; if (!def) return;
      const params: Record<string, number> = {};
      for (const p of def.parameters) params[p.name] = p.defaultValue;
      addIndicator(name, params);
    }
  };

  return (
    <div className="flex flex-col">
      {Object.values(INDICATORS).map((def) => {
        const state = indicators.get(def.name);
        const isActive = state?.visible ?? false;
        const colorKeys = INDICATOR_COLOR_KEYS[def.name] ?? [];
        return (
          <div key={def.name} className="px-3 py-2" style={{ borderBottom: '1px solid #1e1e3a' }}>
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <button className="text-xs font-semibold text-gray-200" onClick={() => handleToggle(def.name)}>{def.displayName}</button>
                <div className="text-[10px] text-gray-500 truncate">{def.description}</div>
              </div>
              <button className={cn('ml-2 h-5 w-9 rounded text-[10px] font-bold transition-colors shrink-0', isActive ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40' : 'bg-gray-800 text-gray-500 border border-gray-700')}
                onClick={() => handleToggle(def.name)}>{isActive ? 'ON' : 'OFF'}</button>
            </div>
            {isActive && colorKeys.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {colorKeys.map((key) => {
                  const currentColor = state?.colors?.[key] || DEFAULT_COLORS[def.name]?.[key] || '#9ca3af';
                  return (
                    <div key={key} className="flex items-center gap-1">
                      <span className="text-[9px] text-gray-500 capitalize">{key.replace('_', ' ')}</span>
                      <input type="color" value={currentColor} onChange={(e) => updateIndicatorColor(def.name, key, e.target.value)}
                        className="w-5 h-5 rounded border border-gray-600 cursor-pointer bg-transparent p-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Journal placeholder
// ---------------------------------------------------------------------------

function JournalTab() {
  return (
    <div className="px-3 py-10 flex flex-col items-center justify-center gap-3">
      <BookOpen className="h-8 w-8 text-gray-600" />
      <p className="text-xs text-gray-400 font-semibold">Trade Journal</p>
      <p className="text-[10px] text-gray-600">Coming in Phase 2</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarPanel
// ---------------------------------------------------------------------------

export function SidebarPanel() {
  const sidebarTab = useAppStore((s) => s.sidebarTab);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const theme = useAppStore((s) => s.theme);

  return (
    <div className="w-[360px] flex flex-col h-full" style={{ background: theme === 'light' ? '#ffffff' : '#111118', borderLeft: `1px solid ${theme === 'light' ? '#e5e7eb' : '#1e1e3a'}` }}>
      <div className="flex shrink-0" style={{ borderBottom: `1px solid ${theme === 'light' ? '#e5e7eb' : '#1e1e3a'}` }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = sidebarTab === tab.key;
          return (
            <button key={tab.key}
              className={cn('flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] transition-colors', isActive ? (theme === 'light' ? 'bg-blue-50 text-blue-700' : 'bg-gray-700 text-white') : (theme === 'light' ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'))}
              onClick={() => setSidebarTab(tab.key)}>
              <Icon className="h-3.5 w-3.5" />
              <span className="font-medium leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div>
            {sidebarTab === 'symbols' && <SymbolsTab />}
            {sidebarTab === 'positions' && <PositionsPanel />}
            {sidebarTab === 'orders' && <OrdersPanel />}
            {sidebarTab === 'account' && <AccountPanel />}
            {sidebarTab === 'indicators' && <IndicatorsTab />}
            {sidebarTab === 'drawings' && <DrawingsTab />}
            {sidebarTab === 'broker' && <BrokerPanel />}
            {sidebarTab === 'journal' && <JournalTab />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
