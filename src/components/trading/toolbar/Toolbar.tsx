'use client';

import { useState, useCallback } from 'react';
import { useChartStore, type BarColors } from '@/stores/chart-store';
import { useSimulationStore } from '@/stores/simulation-store';
import { useAppStore } from '@/stores/app-store';
import { INDICATORS } from '@/lib/engine/indicators';
import { TIMEFRAMES, type Timeframe, type DrawingType } from '@/types/trading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  CandlestickChart, TrendingUp, BarChart3,
  Minus, Square, GitBranch, Type,
  Eye, EyeOff, Settings2,
  Palette, RotateCcw, Layers, X,
  Target, ArrowDown, MoveVertical,
  Sun, Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TIMEFRAME_KEYS = Object.keys(TIMEFRAMES) as Timeframe[];

const DRAWING_TOOLS: Array<{ type: DrawingType; icon: React.ReactNode; label: string }> = [
  { type: 'trendline', icon: <Minus className="size-4 -rotate-45" />, label: 'Trend Line' },
  { type: 'horizontal_line', icon: <Minus className="size-4" />, label: 'Horizontal Line' },
  { type: 'vertical_line', icon: <MoveVertical className="size-4" />, label: 'Vertical Line' },
  { type: 'rectangle', icon: <Square className="size-3.5" />, label: 'Rectangle' },
  { type: 'fibonacci_retracement', icon: <GitBranch className="size-4" />, label: 'Fibonacci' },
  { type: 'channel', icon: <ArrowDown className="size-4 rotate-180" />, label: 'Channel' },
  { type: 'text', icon: <Type className="size-4" />, label: 'Text' },
  { type: 'risk_reward', icon: <Target className="size-4 text-cyan-400" />, label: 'R:R Ratio' },
];

const INDICATOR_LIST = Object.values(INDICATORS);

function fmtPrice(v: number): string {
  if (v >= 10000) return v.toFixed(0);
  return v.toFixed(2);
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-gray-300 min-w-24">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent p-0.5" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-20 text-[10px] font-mono" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }} />
      </div>
    </div>
  );
}

export default function Toolbar() {
  const [indicatorPopoverOpen, setIndicatorPopoverOpen] = useState(false);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<string | null>(null);
  const [tempParams, setTempParams] = useState<Record<string, number>>({});

  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const chartType = useChartStore((s) => s.chartType);
  const volumeVisible = useChartStore((s) => s.volumeVisible);
  const activeDrawingTool = useChartStore((s) => s.activeDrawingTool);
  const indicators = useChartStore((s) => s.indicators);
  const barColors = useChartStore((s) => s.barColors);
  const setTimeframe = useChartStore((s) => s.setTimeframe);
  const setChartType = useChartStore((s) => s.setChartType);
  const setVolumeVisible = useChartStore((s) => s.setVolumeVisible);
  const setActiveDrawingTool = useChartStore((s) => s.setActiveDrawingTool);
  const addIndicator = useChartStore((s) => s.addIndicator);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const updateIndicatorParams = useChartStore((s) => s.updateIndicatorParams);
  const setBarColors = useChartStore((s) => s.setBarColors);
  const resetBarColors = useChartStore((s) => s.resetBarColors);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const currentBar = useSimulationStore((s) => s.currentBar);
  const addToast = useAppStore((s) => s.addToast);

  const handleTimeframeChange = useCallback(async (tf: Timeframe) => {
    setTimeframe(tf);
    useChartStore.getState().setIsRewindMode(false);
    try {
      const sym = useChartStore.getState().symbol;
      const res = await fetch(`/api/bars?symbol=${encodeURIComponent(sym)}&timeframe=${tf}&limit=5000`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        const prevIndex = useChartStore.getState().currentBarIndex;
        useChartStore.getState().setBars(json.data);
        useChartStore.getState().setCurrentBarIndex(Math.max(0, Math.min(prevIndex, json.data.length - 1)));
      }
    } catch { addToast(`Failed to load ${symbol} ${tf} data`, 'error'); }
  }, [setTimeframe, symbol, addToast]);

  const handleIndicatorToggle = useCallback((name: string) => {
    if (indicators.has(name)) { removeIndicator(name); }
    else {
      const def = INDICATORS[name]; if (!def) return;
      const params: Record<string, number> = {};
      for (const p of def.parameters) params[p.name] = p.defaultValue;
      addIndicator(name, params);
    }
  }, [indicators, addIndicator, removeIndicator]);

  const handleBarColorChange = useCallback((key: keyof BarColors, value: string) => { setBarColors({ [key]: value }); }, [setBarColors]);

  return (
    <div className="h-12 flex items-center px-2 gap-1 overflow-x-auto" style={{ background: theme === 'light' ? '#f9fafb' : '#111118', borderBottom: `1px solid ${theme === 'light' ? '#e5e7eb' : '#1e1e3a'}` }}>
      <button
        className="flex items-center gap-1 px-2 h-8 rounded text-sm font-mono font-bold text-emerald-400 transition-colors shrink-0"
        style={{ background: undefined }}
        onClick={() => setSidebarTab('symbols')}
      >
        {symbol}
      </button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <div className="flex items-center gap-0.5">
        {TIMEFRAME_KEYS.map((tf) => (
          <Tooltip key={tf}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm"
                className={cn('h-7 px-1.5 sm:px-2 text-xs font-medium', timeframe === tf ? 'text-gray-100' : theme === 'light' ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-200' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800')}
                style={timeframe === tf ? { background: theme === 'light' ? '#dbeafe' : '#2a2a4a' } : undefined}
                onClick={() => handleTimeframeChange(tf)}>{TIMEFRAMES[tf].label}</Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{TIMEFRAMES[tf].name}</p></TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <div className="flex items-center gap-0.5">
        {[{ type: 'candle' as const, icon: <CandlestickChart className="size-4" />, tip: 'Candlestick' },
          { type: 'line' as const, icon: <TrendingUp className="size-4" />, tip: 'Line' },
          { type: 'bar' as const, icon: <BarChart3 className="size-4" />, tip: 'Bars' },
        ].map(({ type, icon, tip }) => (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon"
                className={cn('size-8', chartType === type ? 'text-gray-100' : theme === 'light' ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-200' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800')}
                style={chartType === type ? { background: theme === 'light' ? '#dbeafe' : '#2a2a4a' } : undefined}
                onClick={() => setChartType(type)}>{icon}</Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{tip}</p></TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <div className="flex items-center gap-0.5">
        {DRAWING_TOOLS.map((tool) => (
          <Tooltip key={tool.type}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon"
                className={cn('size-8', activeDrawingTool === tool.type ? 'text-amber-400 ring-1 ring-amber-500/40' : theme === 'light' ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-200' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800')}
                style={activeDrawingTool === tool.type ? { background: 'rgba(245,158,11,0.15)' } : undefined}
                onClick={() => setActiveDrawingTool(activeDrawingTool === tool.type ? null : tool.type)}>{tool.icon}</Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{tool.label}</p></TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Popover open={indicatorPopoverOpen} onOpenChange={setIndicatorPopoverOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800">
                <Layers className="size-4" /><span className="hidden sm:inline">Indicators</span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>Indicators</p></TooltipContent>
        </Tooltip>
        <PopoverContent className="w-72 p-0" style={{ background: '#1a1a2e', borderColor: '#2a2a4a' }} align="start" sideOffset={8}>
          <div className="p-2" style={{ borderBottom: '1px solid #2a2a4a' }}><span className="text-xs font-semibold text-gray-200">Indicators</span></div>
          <ScrollArea className="max-h-72">
            <div className="p-1">
              {INDICATOR_LIST.map((def) => {
                const isActive = indicators.has(def.name); const state = indicators.get(def.name); const isEditing = editingIndicator === def.name;
                return (
                  <div key={def.name} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-gray-700/50">
                    <Checkbox checked={isActive} onCheckedChange={() => handleIndicatorToggle(def.name)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <button className={cn('text-xs font-medium text-left', isActive ? 'text-gray-100' : 'text-gray-300')} onClick={() => handleIndicatorToggle(def.name)}>{def.displayName}</button>
                        {isActive && <button className="p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-gray-200" onClick={() => { setEditingIndicator(isEditing ? null : def.name); setTempParams(state?.params ?? {}); }}><Settings2 className="size-3" /></button>}
                      </div>
                      {isActive && !isEditing && <span className="text-[10px] text-gray-500 leading-tight">{def.parameters.map((p) => `${p.name}: ${state?.params?.[p.name] ?? p.defaultValue}`).join(', ')}</span>}
                      {isEditing && state && (
                        <div className="flex flex-col gap-2 pt-2 mt-2" style={{ borderTop: '1px solid #2a2a4a' }}>
                          <span className="text-xs text-gray-400 font-medium">Parameters</span>
                          {INDICATORS[def.name].parameters.map((param) => (
                            <div key={param.name} className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-gray-300 min-w-16">{param.name}</Label>
                              <Input type="number" min={param.min} max={param.max} step={param.step}
                                value={tempParams[param.name] ?? state.params[param.name] ?? param.defaultValue}
                                onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) { const u = { ...tempParams, [param.name]: val }; setTempParams(u); updateIndicatorParams(def.name, u); } }}
                                className="h-7 w-20 text-xs" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {isActive && <button className="p-0.5 rounded hover:bg-gray-600 text-gray-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); removeIndicator(def.name); setEditingIndicator(null); }}><X className="size-3" /></button>}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Popover open={colorPopoverOpen} onOpenChange={setColorPopoverOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className={cn('size-8', colorPopoverOpen ? 'text-gray-100' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800')}
                style={colorPopoverOpen ? { background: '#2a2a4a' } : undefined}><Palette className="size-4" /></Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>Bar Colors</p></TooltipContent>
        </Tooltip>
        <PopoverContent className="w-64 p-0" style={{ background: '#1a1a2e', borderColor: '#2a2a4a' }} align="start" sideOffset={8}>
          <div className="p-2 flex items-center justify-between" style={{ borderBottom: '1px solid #2a2a4a' }}>
            <span className="text-xs font-semibold text-gray-200">Bar Colors</span>
            <button className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200" onClick={resetBarColors} title="Reset"><RotateCcw className="size-3" /></button>
          </div>
          <div className="p-3 flex flex-col gap-3">
            <ColorRow label="Bullish Body" value={barColors.upColor} onChange={(v) => handleBarColorChange('upColor', v)} />
            <ColorRow label="Bearish Body" value={barColors.downColor} onChange={(v) => handleBarColorChange('downColor', v)} />
            <ColorRow label="Bullish Border" value={barColors.borderUpColor} onChange={(v) => handleBarColorChange('borderUpColor', v)} />
            <ColorRow label="Bearish Border" value={barColors.borderDownColor} onChange={(v) => handleBarColorChange('borderDownColor', v)} />
            <ColorRow label="Bullish Wick" value={barColors.wickUpColor} onChange={(v) => handleBarColorChange('wickUpColor', v)} />
            <ColorRow label="Bearish Wick" value={barColors.wickDownColor} onChange={(v) => handleBarColorChange('wickDownColor', v)} />
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('size-8', volumeVisible ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300')}
            onClick={() => setVolumeVisible(!volumeVisible)}>{volumeVisible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom"><p>{volumeVisible ? 'Hide Volume' : 'Show Volume'}</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom"><p>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</p></TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {currentBar && (
        <div className="hidden md:flex items-center gap-2 text-xs font-mono whitespace-nowrap mr-1">
          <span className="text-gray-500">O</span><span className={cn(currentBar.close >= currentBar.open ? 'text-emerald-400' : 'text-red-400')}>{fmtPrice(currentBar.open)}</span>
          <span className="text-gray-500">H</span><span className="text-gray-300">{fmtPrice(currentBar.high)}</span>
          <span className="text-gray-500">L</span><span className="text-gray-300">{fmtPrice(currentBar.low)}</span>
          <span className="text-gray-500">C</span><span className={cn(currentBar.close >= currentBar.open ? 'text-emerald-400' : 'text-red-400')}>{fmtPrice(currentBar.close)}</span>
          <span className="text-gray-500">V</span><span className="text-gray-400">{currentBar.volume >= 1_000_000 ? (currentBar.volume / 1_000_000).toFixed(1) + 'M' : currentBar.volume >= 1_000 ? (currentBar.volume / 1_000).toFixed(1) + 'K' : currentBar.volume.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
