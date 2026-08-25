'use client';

import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  BarSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
  type SeriesMarker,
  type SeriesType,
} from 'lightweight-charts';
import { useRef, useEffect, useCallback, useState } from 'react';
import { useChartStore } from '@/stores/chart-store';
import { useSimulationStore } from '@/stores/simulation-store';
import { useAppStore } from '@/stores/app-store';
import { calculateIndicator, INDICATORS } from '@/lib/engine/indicators';
import type { Drawing, Timeframe, OHLCVBar, DrawingType } from '@/types/trading';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize, Eye, EyeOff } from 'lucide-react';

// lightweight-charts v5 generic type workaround for .tsx files
type TimeScaleApiType = ReturnType<IChartApi['timeScale']>;

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

// Theme-aware chart colors
function getChartColors(theme: 'dark' | 'light') {
  if (theme === 'light') {
    return {
      bg: '#ffffff',
      grid: '#e5e7eb',
      text: '#374151',
      volumeUp: 'rgba(16, 185, 129, 0.25)',
      volumeDown: 'rgba(239, 68, 68, 0.25)',
      rewindLine: 'rgba(245, 158, 11, 0.15)',
      rewindHandle: 'rgba(245, 158, 11, 0.25)',
      rewindLabelBg: 'rgba(245, 158, 11, 0.15)',
      rewindLabelText: 'rgba(180, 120, 10, 0.7)',
      hLabelBg: '#f3f4f6',
      selectionColor: '#3b82f6',
    };
  }
  return {
    bg: '#13131a',
    grid: '#1e1e3a',
    text: '#9ca3af',
    volumeUp: 'rgba(16, 185, 129, 0.35)',
    volumeDown: 'rgba(239, 68, 68, 0.35)',
    rewindLine: 'rgba(245, 158, 11, 0.08)',
    rewindHandle: 'rgba(245, 158, 11, 0.18)',
    rewindLabelBg: 'rgba(245, 158, 11, 0.08)',
    rewindLabelText: 'rgba(245, 158, 11, 0.35)',
    hLabelBg: '#1e1e3a',
    selectionColor: '#3b82f6',
  };
}
const SELECTION_COLOR = '#3b82f6';
const HANDLE_SIZE = 8;
const HANDLE_HIT = HANDLE_SIZE + 6;

const DEFAULT_INDICATOR_COLORS: Record<string, Record<string, string>> = {
  SMA: { line: '#f59e0b' },
  EMA: { line: '#a855f7' },
  RSI: { line: '#06b6d4' },
  MACD: { macd: '#f59e0b', signal: '#f97316', histogram_up: '#10b981', histogram_down: '#ef4444' },
  BollingerBands: { upper: '#ef4444', middle: '#f59e0b', lower: '#22c55e' },
  ATR: { line: '#ec4899' },
  Volume_MA: { line: '#a855f7' },
  Stochastic: { k: '#06b6d4', d: '#f97316' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPrice(v: number): string {
  if (v >= 10000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(2);
  return v.toFixed(v < 10 ? 4 : 2);
}

function fmtVolume(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + 'B';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toString();
}

interface IndicatorSeriesRef {
  name: string;
  subKey?: string;
  series: ISeriesApi<SeriesType>;
}

// ---------------------------------------------------------------------------
// Time-to-coordinate extrapolation
// ---------------------------------------------------------------------------

/**
 * Convert a Unix timestamp to screen X coordinate.
 * If lightweight-charts returns null (time outside data range),
 * extrapolate linearly using the first/last bar timestamps.
 */
function timeToScreenX(
  timeVal: number,
  ts: TimeScaleApiType,
  canvasWidth: number,
  bars: OHLCVBar[],
): number | null {
  // Try native conversion first (fast path)
  const native = ts.timeToCoordinate(timeVal as Time);
  if (native !== null) return Number(native);

  // Extrapolate using first/last bar data (correct timestamps, not logical indices)
  if (bars.length < 2) return null;
  const firstBar = bars[0];
  const lastBar = bars[bars.length - 1];
  const firstX = ts.timeToCoordinate(firstBar.time as Time);
  const lastX = ts.timeToCoordinate(lastBar.time as Time);
  if (firstX === null || lastX === null) return null;
  const timeRange = lastBar.time - firstBar.time;
  if (timeRange === 0) return null;
  const pixelsPerSecond = (Number(lastX) - Number(firstX)) / timeRange;
  return Number(firstX) + (timeVal - firstBar.time) * pixelsPerSecond;
}

// ---------------------------------------------------------------------------
// Hit testing for drawing selection
// ---------------------------------------------------------------------------

interface ScreenPt { x: number; y: number }

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointInRect(px: number, py: number, x1: number, y1: number, x2: number, y2: number): boolean {
  return px >= Math.min(x1, x2) && px <= Math.max(x1, x2) &&
         py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
}

function hitTestDrawing(
  mx: number, my: number,
  screenPts: ScreenPt[][],
  drawing: Drawing,
): boolean {
  if (screenPts.length === 0) return false;
  const threshold = 12;
  switch (drawing.type) {
    case 'trendline':
    case 'channel':
      if (screenPts[0].length >= 2) {
        return distToSegment(mx, my, screenPts[0][0].x, screenPts[0][0].y, screenPts[0][1].x, screenPts[0][1].y) < threshold;
      }
      return false;
    case 'horizontal_line':
      if (screenPts[0].length >= 1) {
        return Math.abs(my - screenPts[0][0].y) < threshold;
      }
      return false;
    case 'rectangle':
      if (screenPts[0].length >= 2) {
        const [a, b] = screenPts[0];
        const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
        const x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
        if (pointInRect(mx, my, x1 - threshold, y1 - threshold, x2 + threshold, y2 + threshold)) {
          if (drawing.fill) return true;
          const onEdge =
            (Math.abs(my - y1) < threshold || Math.abs(my - y2) < threshold) && mx >= x1 - threshold && mx <= x2 + threshold ||
            (Math.abs(mx - x1) < threshold || Math.abs(mx - x2) < threshold) && my >= y1 - threshold && my <= y2 + threshold;
          return onEdge;
        }
      }
      return false;
    case 'fibonacci_retracement':
      if (screenPts[0].length >= 2) {
        const x1 = Math.min(screenPts[0][0].x, screenPts[0][1].x);
        const x2 = Math.max(screenPts[0][0].x, screenPts[0][1].x);
        const yMin = Math.min(screenPts[0][0].y, screenPts[0][1].y);
        const yMax = Math.max(screenPts[0][0].y, screenPts[0][1].y);
        return mx >= x1 - threshold && mx <= x2 + threshold && my >= yMin - threshold && my <= yMax + threshold;
      }
      return false;
    case 'text':
      if (screenPts[0].length >= 1) {
        return Math.abs(mx - screenPts[0][0].x) < 50 && Math.abs(my - screenPts[0][0].y - 8) < 16;
      }
      return false;
    case 'vertical_line':
      if (screenPts[0].length >= 1) {
        return Math.abs(mx - screenPts[0][0].x) < threshold;
      }
      return false;
    case 'risk_reward':
      if (screenPts[0].length >= 3) {
        const [entry, sl, tp] = screenPts[0];
        const yTop = Math.min(entry.y, sl.y, tp.y) - 20;
        const yBot = Math.max(entry.y, sl.y, tp.y) + 20;
        const xLeft = Math.min(entry.x, sl.x, tp.x) - 40;
        const xRight = Math.max(entry.x, sl.x, tp.x) + 80;
        return mx >= xLeft && mx <= xRight && my >= yTop && my <= yBot;
      }
      return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Handle hit testing
// ---------------------------------------------------------------------------

/** Hit-test handles: returns handle index or -1 */
function hitTestHandles(mx: number, my: number, handles: ScreenPt[]): number {
  for (let i = 0; i < handles.length; i++) {
    if (Math.abs(mx - handles[i].x) <= HANDLE_HIT && Math.abs(my - handles[i].y) <= HANDLE_HIT) {
      return i;
    }
  }
  return -1;
}

/** Get the screen-space handles for a drawing (for hit testing & rendering) */
function getDrawingHandles(drawing: Drawing, pts: ScreenPt[]): ScreenPt[] {
  if (pts.length === 0) return [];
  switch (drawing.type) {
    case 'rectangle':
      if (pts.length >= 2) {
        return [
          { x: pts[0].x, y: pts[0].y },
          { x: pts[1].x, y: pts[0].y },
          { x: pts[1].x, y: pts[1].y },
          { x: pts[0].x, y: pts[1].y },
        ];
      }
      return pts;
    case 'horizontal_line':
    case 'vertical_line':
    case 'text':
      return pts.length >= 1 ? [pts[0]] : [];
    case 'risk_reward':
      // R:R: 3 handles — one per point (entry, SL, TP)
      return pts.slice(0, 3);
    default:
      return pts;
  }
}

// ---------------------------------------------------------------------------
// Drag state
// ---------------------------------------------------------------------------

export interface DragState {
  drawingId: string;
  mode: 'handle' | 'body';
  handleIndex: number;
  startMouseX: number;
  startMouseY: number;
  origPoints: Array<{ time: number; price: number }>;
}

// ---------------------------------------------------------------------------
// Drawing Renderer
// ---------------------------------------------------------------------------

interface RenderCtx {
  canvas: HTMLCanvasElement;
  chart: IChartApi;
  mainSeries: ISeriesApi<SeriesType>;
  drawings: Drawing[];
  isRewindMode: boolean;
  playheadTime: number | null;
  selectedDrawingId: string | null;
  currentTf: Timeframe;
  bars: OHLCVBar[];
  // For drag preview: if set, overrides store drawing data
  dragPreviewDrawing?: Drawing | null;
}

/** Convert drawing points to screen coordinates using raw timestamps.
 *  All timeframes now share the same universal time range, so absolute
 *  timestamps map to correct screen positions on any TF without snapping.
 */
function drawingToScreenPts(
  drawing: Drawing,
  ts: TimeScaleApiType,
  mainSeries: ISeriesApi<SeriesType>,
  canvasWidth: number,
  bars: OHLCVBar[],
): ScreenPt[] {
  return drawing.points
    .map((p) => {
      // Use raw timestamp directly — no snapping needed since all TFs share the same time range
      const x = timeToScreenX(p.time, ts, canvasWidth, bars);
      const y = mainSeries.priceToCoordinate(p.price);
      if (x === null || y === null) return null;
      return { x, y: Number(y) };
    })
    .filter((p): p is ScreenPt => p !== null);
}

export function renderDrawings(ctx: RenderCtx) {
  const { canvas, chart, mainSeries, drawings, isRewindMode, playheadTime, selectedDrawingId, currentTf, bars, dragPreviewDrawing } = ctx;
  const c = canvas.getContext('2d');
  if (!c) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, rect.width, rect.height);

  const ts = chart.timeScale();

  // Get theme-aware colors
  const theme = useAppStore.getState().theme;
  const cc = getChartColors(theme);

  // ── Rewind mode: dimmed vertical rule ──
  if (isRewindMode && playheadTime !== null) {
    const px = ts.timeToCoordinate(playheadTime as Time);
    if (px !== null) {
      const xPos = Number(px);

      // Vertical rule — very dimmed
      c.strokeStyle = cc.rewindLine;
      c.lineWidth = 1;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(xPos, 0);
      c.lineTo(xPos, rect.height);
      c.stroke();
      c.setLineDash([]);

      // Small dimmed handle at top
      c.fillStyle = cc.rewindHandle;
      c.fillRect(xPos - 4, 0, 8, 8);

      // Date label
      const storeBars = useChartStore.getState().bars;
      const storeIdx = useChartStore.getState().currentBarIndex;
      if (storeIdx >= 0 && storeIdx < storeBars.length) {
        const bar = storeBars[storeIdx];
        const dateStr = new Date(bar.time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const timeStr = new Date(bar.time * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const label = `${dateStr} ${timeStr}`;
        c.font = '9px sans-serif';
        const tw = c.measureText(label).width + 8;
        c.fillStyle = cc.rewindLabelBg;
        c.fillRect(xPos - tw / 2, 9, tw, 14);
        c.fillStyle = cc.rewindLabelText;
        c.textAlign = 'center';
        c.fillText(label, xPos, 20);
        c.textAlign = 'start';
      }
    }
  }

  // Draw all shapes
  for (const drawing of drawings) {
    // For the dragging drawing, use the drag preview if available
    const effectiveDrawing = (dragPreviewDrawing && dragPreviewDrawing.id === drawing.id) ? dragPreviewDrawing : drawing;

    // Drawings persist across ALL timeframes and replay modes by default
    if (effectiveDrawing.visibleTimeframes && effectiveDrawing.visibleTimeframes.length > 0) {
      if (!effectiveDrawing.visibleTimeframes.includes(currentTf)) continue;
    }

    const isSelected = effectiveDrawing.id === selectedDrawingId;
    const col = effectiveDrawing.color || '#f59e0b';
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = effectiveDrawing.lineWidth || 2;
    c.setLineDash(effectiveDrawing.style === 'dashed' ? [6, 4] : []);

    // Use extrapolation for ALL points — shapes can extend past visible data
    const pts = drawingToScreenPts(effectiveDrawing, ts, mainSeries, rect.width, bars);

    if (pts.length === 0) continue;

    switch (effectiveDrawing.type) {
      case 'trendline':
        if (pts.length >= 2) {
          c.beginPath(); c.moveTo(pts[0].x, pts[0].y); c.lineTo(pts[1].x, pts[1].y); c.stroke();
        }
        break;
      case 'horizontal_line':
        if (pts.length >= 1) {
          c.beginPath(); c.setLineDash([8, 4]);
          c.moveTo(0, pts[0].y); c.lineTo(rect.width, pts[0].y); c.stroke();
          c.setLineDash([]);
          c.font = '11px monospace'; c.fillStyle = cc.hLabelBg;
          const hLabel = fmtPrice(effectiveDrawing.points[0].price);
          const lw = c.measureText(hLabel).width + 8;
          c.fillRect(rect.width - lw - 4, pts[0].y - 9, lw, 18);
          c.fillStyle = col; c.fillText(hLabel, rect.width - lw, pts[0].y + 4);
        }
        break;
      case 'rectangle':
        if (pts.length >= 2) {
          const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
          const w = Math.abs(pts[1].x - pts[0].x), h = Math.abs(pts[1].y - pts[0].y);
          if (effectiveDrawing.fill) {
            c.fillStyle = (effectiveDrawing.fillColor || col) + '20';
            c.fillRect(x, y, w, h);
            c.strokeStyle = col;
          }
          c.strokeRect(x, y, w, h);
        }
        break;
      case 'fibonacci_retracement':
        if (pts.length >= 2 && effectiveDrawing.fibLevels) {
          const x1 = Math.min(pts[0].x, pts[1].x), x2 = Math.max(pts[0].x, pts[1].x);
          const fibColors = ['#ef4444', '#f97316', '#eab308', '#a855f7', '#06b6d4', '#10b981', '#3b82f6'];
          effectiveDrawing.fibLevels.forEach((level, i) => {
            const fy = mainSeries.priceToCoordinate(level.price);
            if (fy === null) return;
            const yPos = Number(fy);
            c.strokeStyle = fibColors[i % fibColors.length];
            c.fillStyle = fibColors[i % fibColors.length];
            c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x1, yPos); c.lineTo(x2, yPos); c.stroke();
            c.setLineDash([]); c.font = '10px monospace';
            c.fillText(`${(level.level * 100).toFixed(1)}% (${fmtPrice(level.price)})`, x1 + 4, yPos - 4);
          });
        }
        break;
      case 'text':
        if (pts.length >= 1 && effectiveDrawing.text) {
          c.font = '12px sans-serif'; c.fillStyle = col;
          c.fillText(effectiveDrawing.text, pts[0].x + 4, pts[0].y - 8);
        }
        break;
      case 'vertical_line':
        if (pts.length >= 1) {
          c.setLineDash([4, 4]); c.beginPath(); c.moveTo(pts[0].x, 0); c.lineTo(pts[0].x, rect.height); c.stroke();
        }
        break;
      case 'channel':
        if (pts.length >= 2) {
          c.beginPath(); c.moveTo(pts[0].x, pts[0].y); c.lineTo(pts[1].x, pts[1].y); c.stroke();
        }
        break;
      case 'risk_reward': {
        // R:R tool: 3 points — [0]=entry, [1]=stop loss, [2]=take profit
        if (pts.length >= 3) {
          const [entryPt, slPt, tpPt] = pts;
          const cx = entryPt.x;
          const entryPrice = effectiveDrawing.points[0].price;
          const slPrice = effectiveDrawing.points[1].price;
          const tpPrice = effectiveDrawing.points[2].price;
          const risk = Math.abs(entryPrice - slPrice);
          const reward = Math.abs(tpPrice - entryPrice);
          const rr = risk > 0 ? reward / risk : 0;
          const rrRatio = effectiveDrawing.rrRatio ?? rr;

          const isLong = slPrice < entryPrice;

          // Entry line (white dashed)
          c.setLineDash([6, 3]);
          c.strokeStyle = '#ffffff'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(cx - 30, entryPt.y); c.lineTo(cx + 30, entryPt.y); c.stroke();
          c.setLineDash([]);

          // SL rectangle
          c.fillStyle = 'rgba(239, 68, 68, 0.12)';
          c.fillRect(cx - 20, Math.min(entryPt.y, slPt.y), 40, Math.abs(entryPt.y - slPt.y));
          c.strokeStyle = '#ef4444'; c.lineWidth = 1;
          c.setLineDash([4, 3]);
          c.beginPath(); c.moveTo(cx - 20, slPt.y); c.lineTo(cx + 20, slPt.y); c.stroke();
          c.setLineDash([]);

          // TP rectangle
          c.fillStyle = 'rgba(16, 185, 129, 0.12)';
          c.fillRect(cx - 20, Math.min(entryPt.y, tpPt.y), 40, Math.abs(entryPt.y - tpPt.y));
          c.strokeStyle = '#10b981'; c.lineWidth = 1;
          c.setLineDash([4, 3]);
          c.beginPath(); c.moveTo(cx - 20, tpPt.y); c.lineTo(cx + 20, tpPt.y); c.stroke();
          c.setLineDash([]);

          // Labels
          c.font = 'bold 10px sans-serif'; c.textAlign = 'left';
          c.fillStyle = '#ffffff';
          c.fillText(`Entry: ${fmtPrice(entryPrice)}`, cx + 25, entryPt.y + 4);
          c.fillStyle = '#ef4444';
          c.fillText(`SL: ${fmtPrice(slPrice)}`, cx + 25, slPt.y + 4);
          c.fillStyle = '#10b981';
          c.fillText(`TP: ${fmtPrice(tpPrice)}`, cx + 25, tpPt.y + 4);

          // R:R label
          const yTop = Math.min(slPt.y, tpPt.y, entryPt.y);
          c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
          c.fillStyle = '#06b6d4';
          c.fillText(`R:R ${rrRatio.toFixed(1)}`, cx, yTop - 12);

          c.font = '9px sans-serif';
          c.fillStyle = '#ef4444';
          c.fillText(`Risk: ${fmtPrice(risk)}`, cx, slPt.y + (isLong ? 14 : -8));
          c.fillStyle = '#10b981';
          c.fillText(`Reward: ${fmtPrice(reward)}`, cx, tpPt.y + (isLong ? -8 : 14));
          c.textAlign = 'start';
        }
        break;
      }
    }

    // Selection handles
    if (isSelected) {
      const handles = getDrawingHandles(effectiveDrawing, pts);
      c.setLineDash([]);
      for (const h of handles) {
        c.fillStyle = SELECTION_COLOR;
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(h.x, h.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
        c.fill(); c.stroke();
      }
    }

    c.setLineDash([]);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TradingChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const indicatorSeriesRef = useRef<IndicatorSeriesRef[]>([]);
  const drawingPointsRef = useRef<Array<{ time: number; price: number }>>([]);
  const activeDrawingToolRef = useRef<string | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const hasFitRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const lastClickTimeRef = useRef(0);
  const isRewindModeRef = useRef(false);
  const isDraggingRef = useRef(false);
  // Ref for smooth drag preview — avoids store updates during drag
  const dragPreviewRef = useRef<Drawing | null>(null);

  // Store
  const bars = useChartStore((s) => s.bars);
  const currentBarIndex = useChartStore((s) => s.currentBarIndex);
  const chartType = useChartStore((s) => s.chartType);
  const indicators = useChartStore((s) => s.indicators);
  const volumeVisible = useChartStore((s) => s.volumeVisible);
  const crosshairVisible = useChartStore((s) => s.crosshairVisible);
  const activeDrawingTool = useChartStore((s) => s.activeDrawingTool);
  const drawings = useChartStore((s) => s.drawings);
  const selectedDrawingId = useChartStore((s) => s.selectedDrawingId);
  const barColors = useChartStore((s) => s.barColors);
  const isRewindMode = useChartStore((s) => s.isRewindMode);
  const addDrawing = useChartStore((s) => s.addDrawing);
  const updateDrawing = useChartStore((s) => s.updateDrawing);
  const setActiveDrawingTool = useChartStore((s) => s.setActiveDrawingTool);
  const setSelectedDrawingId = useChartStore((s) => s.setSelectedDrawingId);
  const timeframe = useChartStore((s) => s.timeframe);
  const setIsPlaying = useChartStore((s) => s.setIsPlaying);
  const symbol = useChartStore((s) => s.symbol);

  const currentBar = useSimulationStore((s) => s.currentBar);
  const openTrades = useSimulationStore((s) => s.openTrades);
  const closedTrades = useSimulationStore((s) => s.closedTrades);
  const advanceToBar = useSimulationStore((s) => s.advanceToBar);

  // App store for order dialog
  const setShowOrderDialog = useAppStore((s) => s.setShowOrderDialog);
  const setOrderDialogSide = useAppStore((s) => s.setOrderDialogSide);
  const isFullscreen = useAppStore((s) => s.isFullscreen);
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen);
  const showMobileBuySell = useAppStore((s) => s.showMobileBuySell);
  const toggleMobileBuySell = useAppStore((s) => s.toggleMobileBuySell);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => { activeDrawingToolRef.current = activeDrawingTool; }, [activeDrawingTool]);
  useEffect(() => { isRewindModeRef.current = isRewindMode; }, [isRewindMode]);

  // When exiting rewind mode, reset fit so full bar set is re-fitted
  useEffect(() => {
    if (!isRewindMode) hasFitRef.current = false;
  }, [isRewindMode]);

  // ---- Apply theme to chart when it changes ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const cc = getChartColors(theme);
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: cc.bg }, textColor: cc.text },
      grid: { vertLines: { color: cc.grid }, horzLines: { color: cc.grid } },
    });
  }, [theme]);

  const [crosshairData, setCrosshairData] = useState<{ time: string; o: number; h: number; l: number; c: number; v: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const [editingTextPos, setEditingTextPos] = useState<{ x: number; y: number } | null>(null);

  // ---- Helper: get screen points for a drawing (with extrapolation) ----
  const getDrawingScreenPts = useCallback((drawing: Drawing): ScreenPt[] => {
    const chart = chartRef.current, ms = mainSeriesRef.current;
    if (!chart || !ms) return [];
    const ts = chart.timeScale();
    const canvas = drawingCanvasRef.current;
    const canvasWidth = canvas ? canvas.getBoundingClientRect().width : 800;
    const storeBars = useChartStore.getState().bars;
    // During replay, use visible bars for consistent extrapolation past playhead
    const rewind = useChartStore.getState().isRewindMode;
    const idx = useChartStore.getState().currentBarIndex;
    const extrapolationBars = rewind && idx >= 0
      ? storeBars.slice(0, Math.min(idx + 1, storeBars.length))
      : storeBars;
    return drawingToScreenPts(drawing, ts, ms, canvasWidth, extrapolationBars);
  }, []);

  // ---- Shape interaction: pointer down on canvas ----
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const chart = chartRef.current, ms = mainSeriesRef.current;
    if (!chart || !ms) return;

    const canvasRect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;

    const selId = useChartStore.getState().selectedDrawingId;
    if (!selId) return;

    const drawing = useChartStore.getState().drawings.find((d) => d.id === selId);
    if (!drawing) {
      useChartStore.getState().setSelectedDrawingId(null);
      return;
    }

    const pts = getDrawingScreenPts(drawing);
    const handles = getDrawingHandles(drawing, pts);

    // Check handle hit first
    const handleIdx = hitTestHandles(mx, my, handles);
    if (handleIdx >= 0) {
      isDraggingRef.current = true;
      dragStateRef.current = {
        drawingId: selId,
        mode: 'handle',
        handleIndex: handleIdx,
        startMouseX: mx,
        startMouseY: my,
        origPoints: drawing.points.map((p) => ({ ...p })),
      };
      // Capture pointer for smooth dragging
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Check body hit (for body drag)
    if (hitTestDrawing(mx, my, [pts], drawing)) {
      isDraggingRef.current = true;
      dragStateRef.current = {
        drawingId: selId,
        mode: 'body',
        handleIndex: -1,
        startMouseX: mx,
        startMouseY: my,
        origPoints: drawing.points.map((p) => ({ ...p })),
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Clicked on empty space — deselect
    useChartStore.getState().setSelectedDrawingId(null);
  }, [getDrawingScreenPts]);

  // ---- Shape interaction: pointer move ----
  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const chart = chartRef.current, ms = mainSeriesRef.current;
    if (!chart || !ms) return;

    const canvasRect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;

    if (!isDraggingRef.current) {
      // Update cursor
      const selId = useChartStore.getState().selectedDrawingId;
      if (selId) {
        const drawing = useChartStore.getState().drawings.find((d) => d.id === selId);
        if (drawing) {
          const pts = getDrawingScreenPts(drawing);
          const handles = getDrawingHandles(drawing, pts);
          if (hitTestHandles(mx, my, handles) >= 0) {
            (e.target as HTMLElement).style.cursor = 'nwse-resize';
          } else if (hitTestDrawing(mx, my, [pts], drawing)) {
            (e.target as HTMLElement).style.cursor = 'move';
          } else {
            (e.target as HTMLElement).style.cursor = 'default';
          }
        }
      }
      return;
    }

    const drag = dragStateRef.current;
    if (!drag) return;

    const dx = mx - drag.startMouseX;
    const dy = my - drag.startMouseY;
    const ts = chart.timeScale();
    const canvasWidth = canvasRect.width;

    // Forward extrapolation: time → screen X (handles points beyond chart data)
    const storeBars = useChartStore.getState().bars;
    const rewind = useChartStore.getState().isRewindMode;
    const rIdx = useChartStore.getState().currentBarIndex;
    const visBars = rewind && rIdx >= 0
      ? storeBars.slice(0, Math.min(rIdx + 1, storeBars.length))
      : storeBars;
    const extrapolateX = (t: number): number | null => {
      const native = ts.timeToCoordinate(t as Time);
      if (native !== null) return Number(native);
      if (visBars.length < 2) return null;
      const fBar = visBars[0], lBar = visBars[visBars.length - 1];
      const fX = ts.timeToCoordinate(fBar.time as Time);
      const lX = ts.timeToCoordinate(lBar.time as Time);
      if (fX === null || lX === null) return null;
      const tr = lBar.time - fBar.time;
      if (tr === 0) return null;
      return Number(fX) + (t - fBar.time) * ((Number(lX) - Number(fX)) / tr);
    };

    const drawing = useChartStore.getState().drawings.find((d) => d.id === drag.drawingId);
    if (!drawing) return;

    // Helper: convert screen coord to time/price
    const screenToTimePrice = (screenX: number, screenY: number): { time: number; price: number } | null => {
      let timeVal: number | null = null;
      const nativeTime = ts.coordinateToTime(screenX);
      if (nativeTime !== null) {
        timeVal = typeof nativeTime === 'number' ? nativeTime : new Date(nativeTime as string).getTime() / 1000;
      } else {
        if (visBars.length >= 2) {
          const firstBar = visBars[0];
          const lastBar = visBars[visBars.length - 1];
          const firstX = ts.timeToCoordinate(firstBar.time as Time);
          const lastX = ts.timeToCoordinate(lastBar.time as Time);
          if (firstX !== null && lastX !== null) {
            const timeRange = lastBar.time - firstBar.time;
            if (timeRange !== 0) {
              const pps = (Number(lastX) - Number(firstX)) / timeRange;
              timeVal = firstBar.time + (screenX - Number(firstX)) / pps;
            }
          }
        }
      }
      const price = ms.coordinateToPrice(screenY);
      if (timeVal === null || price === null) return null;
      return { time: timeVal, price };
    };

    if (drag.mode === 'handle') {
      const hi = drag.handleIndex;
      const newPoints = drag.origPoints.map((p) => ({ ...p }));

      let ptIdx: number;
      if (drawing.type === 'rectangle' && newPoints.length >= 2 && hi >= 0 && hi <= 3) {
        switch (hi) {
          case 0: ptIdx = 0; break;
          case 1: ptIdx = -1; break;
          case 2: ptIdx = 1; break;
          case 3: ptIdx = -2; break;
          default: ptIdx = 0;
        }
      } else {
        ptIdx = Math.min(hi, newPoints.length - 1);
      }

      if (drawing.type === 'rectangle' && (ptIdx === -1 || ptIdx === -2)) {
        const isTopRight = ptIdx === -1;
        const timePoint = isTopRight ? newPoints[1] : newPoints[0];
        const pricePoint = isTopRight ? newPoints[0] : newPoints[1];

        const origTimeCoord = extrapolateX(timePoint.time);
        const origPriceCoord = ms.priceToCoordinate(pricePoint.price);
        if (origTimeCoord === null || origPriceCoord === null) return;

        const newTimeCoord = origTimeCoord + dx;
        const newPriceCoord = Number(origPriceCoord) + dy;
        const converted = screenToTimePrice(newTimeCoord, newPriceCoord);
        if (!converted) return;

        timePoint.time = converted.time;
        pricePoint.price = converted.price;
      } else {
        const origTimeCoord = extrapolateX(newPoints[ptIdx].time);
        const origPriceCoord = ms.priceToCoordinate(newPoints[ptIdx].price);
        if (origTimeCoord === null || origPriceCoord === null) return;

        const newTimeCoord = origTimeCoord + dx;
        const newPriceCoord = Number(origPriceCoord) + dy;
        const converted = screenToTimePrice(newTimeCoord, newPriceCoord);
        if (!converted) return;

        newPoints[ptIdx].time = converted.time;
        newPoints[ptIdx].price = converted.price;
      }

      // Recalculate derived data
      if (drawing.type === 'fibonacci_retracement' && newPoints.length >= 2) {
        const high = Math.max(newPoints[0].price, newPoints[1].price);
        const low = Math.min(newPoints[0].price, newPoints[1].price);
        dragPreviewRef.current = {
          ...drawing,
          points: newPoints,
          fibLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((level) => ({ level, price: high - level * (high - low) })),
        };
      } else if (drawing.type === 'risk_reward' && newPoints.length >= 3) {
        const risk = Math.abs(newPoints[0].price - newPoints[1].price);
        const reward = Math.abs(newPoints[2].price - newPoints[0].price);
        const rrRatio = risk > 0 ? reward / risk : 0;
        // R:R: allow each handle to move freely in both time and price
        dragPreviewRef.current = { ...drawing, points: newPoints, rrRatio };
      } else {
        dragPreviewRef.current = { ...drawing, points: newPoints };
      }
    } else if (drag.mode === 'body') {
      const newPoints = drag.origPoints.map((origPt) => {
        const origX = extrapolateX(origPt.time);
        const origY = ms.priceToCoordinate(origPt.price);
        if (origX === null || origY === null) return { ...origPt };

        const newX = origX + dx;
        const newY = Number(origY) + dy;
        const converted = screenToTimePrice(newX, newY);
        if (!converted) return { ...origPt };

        return { time: converted.time, price: converted.price };
      });

      if (drawing.type === 'fibonacci_retracement' && newPoints.length >= 2) {
        const high = Math.max(newPoints[0].price, newPoints[1].price);
        const low = Math.min(newPoints[0].price, newPoints[1].price);
        dragPreviewRef.current = {
          ...drawing,
          points: newPoints,
          fibLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((level) => ({ level, price: high - level * (high - low) })),
        };
      } else if (drawing.type === 'risk_reward' && newPoints.length >= 3) {
        const risk = Math.abs(newPoints[0].price - newPoints[1].price);
        const reward = Math.abs(newPoints[2].price - newPoints[0].price);
        const rrRatio = risk > 0 ? reward / risk : 0;
        dragPreviewRef.current = { ...drawing, points: newPoints, rrRatio };
      } else {
        dragPreviewRef.current = { ...drawing, points: newPoints };
      }
    }

    // Redraw with preview (no store update during drag — prevents freeze)
    redrawRef.current();
  }, [getDrawingScreenPts]);

  // ---- Shape interaction: pointer up ----
  const handleCanvasPointerUp = useCallback(() => {
    if (isDraggingRef.current && dragStateRef.current && dragPreviewRef.current) {
      // Commit the drag preview to the store
      const preview = dragPreviewRef.current;
      updateDrawing(preview.id, {
        points: preview.points,
        fibLevels: preview.fibLevels,
        rrRatio: preview.rrRatio,
      });
      dragPreviewRef.current = null;
    }
    isDraggingRef.current = false;
    dragStateRef.current = null;
  }, [updateDrawing]);

  // ---- Double-click: text editing + selection toggle ----
  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasRect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;
    const hitId = hitTestDrawingsOnChart(mx, my);
    const currentSel = useChartStore.getState().selectedDrawingId;

    if (hitId) {
      // Text shape → open editor
      const drawing = useChartStore.getState().drawings.find((d) => d.id === hitId);
      if (drawing?.type === 'text') {
        const pts = getDrawingScreenPts(drawing);
        if (pts.length >= 1) {
          setEditingTextId(hitId);
          setEditingTextValue(drawing.text || '');
          setEditingTextPos({ x: pts[0].x, y: pts[0].y });
          useChartStore.getState().setSelectedDrawingId(hitId);
        }
        return;
      }
      // Non-text shape: double-click on selected → deselect, on different → select
      if (hitId === currentSel) {
        useChartStore.getState().setSelectedDrawingId(null);
      } else {
        useChartStore.getState().setSelectedDrawingId(hitId);
      }
      return;
    }

    // Double-click on empty canvas → deselect
    useChartStore.getState().setSelectedDrawingId(null);
  }, [getDrawingScreenPts]);

  const commitTextEdit = useCallback(() => {
    if (editingTextId) {
      useChartStore.getState().updateDrawing(editingTextId, { text: editingTextValue });
    }
    setEditingTextId(null);
    setEditingTextPos(null);
  }, [editingTextId, editingTextValue]);

  // ---- Create chart ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      const raf = requestAnimationFrame(() => createChartInstance());
      return () => cancelAnimationFrame(raf);
    }
    createChartInstance();

    function createChartInstance() {
      const c = containerRef.current;
      if (!c || chartRef.current) return;
      const tc = useAppStore.getState().theme;
      const cc = getChartColors(tc);
      const chart = createChart(c, {
        layout: { background: { type: ColorType.Solid, color: cc.bg }, textColor: cc.text, fontSize: 12 },
        grid: { vertLines: { color: cc.grid }, horzLines: { color: cc.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        leftPriceScale: { borderColor: cc.grid, visible: true },
        rightPriceScale: { borderColor: cc.grid, visible: false },
        timeScale: { borderColor: cc.grid, timeVisible: true, secondsVisible: false },
        handleScroll: { vertTouchDrag: false },
        autoSize: true,
      });
      chartRef.current = chart;

      const bc = useChartStore.getState().barColors;
      const mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: bc.upColor, downColor: bc.downColor,
        borderUpColor: bc.borderUpColor, borderDownColor: bc.borderDownColor,
        wickUpColor: bc.wickUpColor, wickDownColor: bc.wickDownColor,
      });
      mainSeriesRef.current = mainSeries;

      const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volumeSeriesRef.current = volumeSeries;

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) return;
        const time = param.time as Time;
        const ms = mainSeriesRef.current; if (!ms) return;
        const data = param.seriesData.get(ms) as CandlestickData | undefined;
        if (data && 'open' in data) {
          const barData = bars.find((b) => b.time === (typeof time === 'number' ? time : new Date(time as string).getTime() / 1000));
          setCrosshairData({
            time: typeof time === 'number' ? new Date(time * 1000).toLocaleDateString() : String(time),
            o: data.open, h: data.high, l: data.low, c: data.close, v: barData?.volume ?? 0,
          });
        }
      });

      // ---- Click handler ----
      chart.subscribeClick((param) => {
        if (!param.point) return;
        const ms = mainSeriesRef.current; if (!ms) return;
        const chart = chartRef.current; if (!chart) return;
        const x = param.point.x, y = param.point.y;

        // time/price may be null when clicking beyond chart data (past last bar)
        const time = chart.timeScale().coordinateToTime(x);
        const price = ms.coordinateToPrice(y);
        const timeVal = time !== null
          ? (typeof time === 'number' ? time : new Date(time as string).getTime() / 1000)
          : null;

        const tool = activeDrawingToolRef.current;
        const now = Date.now();

        // ── REWIND MODE: click to place vertical rule (needs valid time) ──
        if (isRewindModeRef.current && !tool && timeVal !== null) {
          const storeBars = useChartStore.getState().bars;
          let clickedIdx = -1;
          let minDist = Infinity;
          for (let i = 0; i < storeBars.length; i++) {
            const dist = Math.abs(storeBars[i].time - timeVal);
            if (dist < minDist) { minDist = dist; clickedIdx = i; }
          }
          if (clickedIdx >= 0) {
            useChartStore.getState().setCurrentBarIndex(clickedIdx);
            advanceToBar(clickedIdx);
            setIsPlaying(false);
          }
          return;
        }

        // ── Drawing tool active (needs valid time/price to place points) ──
        if (tool) {
          if (timeVal === null || price === null) return;
          // R:R tool needs 3 clicks (entry, SL, TP)
          if (tool === 'risk_reward') {
            drawingPointsRef.current.push({ time: timeVal, price });
            if (drawingPointsRef.current.length >= 3) {
              const pts = drawingPointsRef.current;
              const entryPrice = pts[0].price;
              const slPrice = pts[1].price;
              const tpPrice = pts[2].price;
              const risk = Math.abs(entryPrice - slPrice);
              const reward = Math.abs(tpPrice - entryPrice);
              const rrRatio = risk > 0 ? reward / risk : 0;
              const rrDrawing: Drawing = {
                id: `drawing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: 'risk_reward',
                points: [
                  { time: pts[0].time, price: entryPrice },
                  { time: pts[1].time, price: slPrice },
                  { time: pts[2].time, price: tpPrice },
                ],
                color: '#06b6d4', lineWidth: 2, style: 'solid', createdAt: Date.now(),
                rrRatio,
                text: `R:R ${rrRatio.toFixed(1)}`,
                symbol: useChartStore.getState().symbol,
                timeframe: useChartStore.getState().timeframe,
              };
              addDrawing(rrDrawing);
              drawingPointsRef.current = [];
            }
            return;
          }

          drawingPointsRef.current.push({ time: timeVal, price });

          const neededPoints = tool === 'horizontal_line' || tool === 'text' || tool === 'vertical_line' ? 1 : 2;
          if (drawingPointsRef.current.length >= neededPoints) {
            const pts = drawingPointsRef.current;
            const drawing: Drawing = {
              id: `drawing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              type: tool as Drawing['type'],
              points: pts.slice(0, neededPoints),
              color: '#f59e0b', lineWidth: 2, style: 'solid', createdAt: Date.now(),
              symbol: useChartStore.getState().symbol,
              timeframe: useChartStore.getState().timeframe,
              // Shapes are only visible in the timeframe they were placed on
              visibleTimeframes: [useChartStore.getState().timeframe],
            };
            if (tool === 'fibonacci_retracement') {
              const prices = pts.map((p) => p.price);
              const high = Math.max(...prices), low = Math.min(...prices);
              drawing.fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((level) => ({ level, price: high - level * (high - low) }));
            }
            if (tool === 'text') drawing.text = 'Annotation';
            if (tool === 'rectangle') { drawing.fill = false; drawing.fillColor = '#f59e0b'; }
            addDrawing(drawing);
            drawingPointsRef.current = [];
          }
          return;
        }

        // ── Selection (screen-coords only — works even beyond chart data) ──
        const isDblClick = now - lastClickTimeRef.current < 350;
        const clickTime = now;
        lastClickTimeRef.current = now;

        if (isDblClick) {
          const hitId = hitTestDrawingsOnChart(x, y);
          const currentSel = useChartStore.getState().selectedDrawingId;
          if (hitId && hitId === currentSel) {
            setSelectedDrawingId(null);
          } else if (hitId) {
            setSelectedDrawingId(hitId);
          } else {
            setSelectedDrawingId(null);
          }
          return;
        }

        setTimeout(() => {
          if (lastClickTimeRef.current !== clickTime) return;
          const hitId = hitTestDrawingsOnChart(x, y);
          if (hitId) setSelectedDrawingId(hitId);
          else setSelectedDrawingId(null);
        }, 400);
      });

      chart.timeScale().subscribeVisibleLogicalRangeChange(() => { redrawRef.current(); });
    }
    return () => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; mainSeriesRef.current = null; volumeSeriesRef.current = null; indicatorSeriesRef.current = []; }
    };
  }, []);

  function hitTestDrawingsOnChart(mx: number, my: number): string | null {
    const chart = chartRef.current, ms = mainSeriesRef.current;
    if (!chart || !ms) return null;
    const ts = chart.timeScale();
    const canvas = drawingCanvasRef.current;
    const canvasWidth = canvas ? canvas.getBoundingClientRect().width : 800;
    const storeDrawings = useChartStore.getState().drawings;
    const tf = useChartStore.getState().timeframe;
    const storeBars = useChartStore.getState().bars;
    // During replay, use visible bars for consistent extrapolation past playhead
    const rewind = useChartStore.getState().isRewindMode;
    const idx = useChartStore.getState().currentBarIndex;
    const extrapolationBars = rewind && idx >= 0
      ? storeBars.slice(0, Math.min(idx + 1, storeBars.length))
      : storeBars;
    for (let i = storeDrawings.length - 1; i >= 0; i--) {
      const d = storeDrawings[i];
      if (d.visibleTimeframes && d.visibleTimeframes.length > 0 && !d.visibleTimeframes.includes(tf)) continue;
      const pts = drawingToScreenPts(d, ts, ms, canvasWidth, extrapolationBars);
      if (hitTestDrawing(mx, my, [pts], d)) return d.id;
    }
    return null;
  }

  // ---- Bar colors ----
  useEffect(() => {
    const ms = mainSeriesRef.current; if (!ms || chartType !== 'candle') return;
    ms.applyOptions({ upColor: barColors.upColor, downColor: barColors.downColor, borderUpColor: barColors.borderUpColor, borderDownColor: barColors.borderDownColor, wickUpColor: barColors.wickUpColor, wickDownColor: barColors.wickDownColor });
  }, [barColors, chartType]);

  // ---- Chart type toggle ----
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    if (mainSeriesRef.current) chart.removeSeries(mainSeriesRef.current);
    const bc = useChartStore.getState().barColors;
    if (chartType === 'candle') {
      mainSeriesRef.current = chart.addSeries(CandlestickSeries, { upColor: bc.upColor, downColor: bc.downColor, borderUpColor: bc.borderUpColor, borderDownColor: bc.borderDownColor, wickUpColor: bc.wickUpColor, wickDownColor: bc.wickDownColor });
    } else if (chartType === 'bar') {
      mainSeriesRef.current = chart.addSeries(BarSeries, { upColor: bc.upColor, downColor: bc.downColor });
    } else {
      mainSeriesRef.current = chart.addSeries(LineSeries, { color: bc.upColor, lineWidth: 2 });
    }
    hasFitRef.current = false;
  }, [chartType]);

  // ---- Update data ----
  useEffect(() => {
    const mainSeries = mainSeriesRef.current, volumeSeries = volumeSeriesRef.current, chart = chartRef.current;
    if (!mainSeries || !volumeSeries || !chart || bars.length === 0) return;

    let visibleBars: OHLCVBar[];
    if (isRewindMode) {
      const endIdx = Math.max(0, Math.min(currentBarIndex + 1, bars.length));
      visibleBars = bars.slice(0, endIdx);
    } else {
      visibleBars = bars;
    }
    if (visibleBars.length === 0) return;

    if (chartType === 'candle') {
      mainSeries.setData(visibleBars.map((bar) => ({ time: bar.time as Time, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
    } else if (chartType === 'bar') {
      mainSeries.setData(visibleBars.map((bar) => ({ time: bar.time as Time, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
    } else {
      mainSeries.setData(visibleBars.map((bar) => ({ time: bar.time as Time, value: bar.close })));
    }

    const themeColors = getChartColors(useAppStore.getState().theme);
    if (volumeVisible) {
      volumeSeries.setData(visibleBars.map((bar) => ({ time: bar.time as Time, value: bar.volume, color: bar.close >= bar.open ? themeColors.volumeUp : themeColors.volumeDown })));
      volumeSeries.applyOptions({ visible: true });
    } else { volumeSeries.applyOptions({ visible: false }); }

    // Trade markers
    const markers: SeriesMarker<Time>[] = [];
    const lastVisibleTime = visibleBars[visibleBars.length - 1].time;
    for (const trade of openTrades) {
      if (trade.entryTime <= lastVisibleTime) {
        markers.push({ time: trade.entryTime as Time, position: trade.side === 'long' ? 'belowBar' : 'aboveBar', color: trade.side === 'long' ? '#10b981' : '#ef4444', shape: trade.side === 'long' ? 'arrowUp' : 'arrowDown', text: `${trade.side.toUpperCase()} ${trade.quantity}` });
      }
    }
    for (const trade of closedTrades) {
      if (trade.entryTime && trade.entryTime <= lastVisibleTime) {
        markers.push({ time: trade.entryTime as Time, position: trade.side === 'long' ? 'belowBar' : 'aboveBar', color: trade.side === 'long' ? '#10b981' : '#ef4444', shape: trade.side === 'long' ? 'arrowUp' : 'arrowDown', text: `${trade.side.toUpperCase()}` });
      }
      if (trade.exitTime && trade.exitTime <= lastVisibleTime) {
        markers.push({ time: trade.exitTime as Time, position: trade.side === 'long' ? 'aboveBar' : 'belowBar', color: trade.pnl !== null && trade.pnl >= 0 ? '#10b981' : '#ef4444', shape: 'circle', text: trade.pnl !== null ? `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}` : 'CLOSE' });
      }
    }
    if (markers.length > 0 && (chartType === 'candle' || chartType === 'bar')) {
      try { (mainSeries as unknown as { setMarkers: (m: SeriesMarker<Time>[]) => void }).setMarkers(markers); } catch { /* */ }
    }

    // Fit content: only on first load and when exiting rewind mode.
    // During replay, the user can zoom/scroll freely — no forced fit on each bar.
    if (!hasFitRef.current) {
      try { chart.timeScale().fitContent(); } catch { /* */ }
      hasFitRef.current = true;
    }
  }, [bars, currentBarIndex, isRewindMode, chartType, volumeVisible, openTrades, closedTrades]);

  // ---- Indicators ----
  const rebuildIndicators = useCallback(() => {
    const chart = chartRef.current; if (!chart || bars.length === 0) return;
    for (const ref of indicatorSeriesRef.current) { try { chart.removeSeries(ref.series); } catch { /* */ } }
    indicatorSeriesRef.current = [];

    const visibleCount = isRewindMode
      ? Math.max(0, Math.min(currentBarIndex + 1, bars.length))
      : bars.length;
    const displayBars = bars.slice(0, visibleCount);

    for (const [name, state] of indicators.entries()) {
      if (!state.visible) continue;
      const def = INDICATORS[name]; if (!def) continue;
      const result = calculateIndicator(name, bars, state.params);
      const defaultColors = DEFAULT_INDICATOR_COLORS[name] ?? { line: '#9ca3af' };
      const colors = { ...defaultColors, ...state.colors };

      if (Array.isArray(result)) {
        const series = chart.addSeries(LineSeries, { color: colors.line, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        const lineData: LineData[] = displayBars.map((bar, i) => { const val = result[i]; return isNaN(val) ? null as unknown as LineData : { time: bar.time as Time, value: val }; }).filter((d): d is LineData => d !== null);
        series.setData(lineData);
        indicatorSeriesRef.current.push({ name, series });
      } else {
        for (const [subKey, values] of Object.entries(result)) {
          const color = colors[subKey]; if (!color) continue;
          if (name === 'MACD' && subKey === 'histogram') {
            const series = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
            const histData = displayBars.map((bar, i) => { const val = (values as number[])[i]; return isNaN(val) ? null : { time: bar.time as Time, value: Math.abs(val), color: val >= 0 ? (colors.histogram_up || '#10b981') : (colors.histogram_down || '#ef4444') }; }).filter((d): d is { time: Time; value: number; color: string } => d !== null) as HistogramData[];
            series.setData(histData);
            indicatorSeriesRef.current.push({ name, subKey, series });
          } else {
            const series = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            const lineData: LineData[] = displayBars.map((bar, i) => { const val = (values as number[])[i]; return isNaN(val) ? null as unknown as LineData : { time: bar.time as Time, value: val }; }).filter((d): d is LineData => d !== null);
            series.setData(lineData);
            indicatorSeriesRef.current.push({ name, subKey, series });
          }
        }
      }
    }
  }, [bars, indicators, isRewindMode, currentBarIndex]);

  useEffect(() => { rebuildIndicators(); }, [rebuildIndicators]);

  // ---- Crosshair visibility ----
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    chart.applyOptions({ crosshair: { mode: CrosshairMode.Normal, vertLine: { visible: crosshairVisible, style: 2, width: 1, color: '#4b5563', labelBackgroundColor: '#374151' }, horzLine: { visible: crosshairVisible, style: 2, width: 1, color: '#4b5563', labelBackgroundColor: '#374151' } } });
  }, [crosshairVisible]);

  // ---- Render drawings + rewind overlay ----
  useEffect(() => {
    redrawRef.current = () => {
      const chart = chartRef.current, ms = mainSeriesRef.current, canvas = drawingCanvasRef.current;
      if (!chart || !ms || !canvas) return;
      let playheadTime: number | null = null;
      const idx = useChartStore.getState().currentBarIndex;
      const storeBars = useChartStore.getState().bars;
      const rewind = useChartStore.getState().isRewindMode;
      if (rewind && idx >= 0 && idx < storeBars.length) playheadTime = storeBars[idx].time;
      // During replay, use only visible bars for extrapolation so shapes can project past the playhead.
      // The first/last visible bars are guaranteed to be in the chart series, so
      // timeToCoordinate succeeds and linear extrapolation extends beyond the playhead.
      const extrapolationBars = rewind && idx >= 0
        ? storeBars.slice(0, Math.min(idx + 1, storeBars.length))
        : storeBars;
      renderDrawings({
        canvas, chart, mainSeries: ms,
        drawings,
        isRewindMode: rewind,
        playheadTime,
        selectedDrawingId,
        currentTf: timeframe,
        bars: extrapolationBars,
        dragPreviewDrawing: dragPreviewRef.current,
      });
    };
    redrawRef.current();
  }, [drawings, currentBarIndex, isRewindMode, selectedDrawingId, timeframe]);

  // ---- Keyboard: Delete selected drawing ----
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        useChartStore.getState().removeDrawing(selectedDrawingId);
      }
      if (e.key === 'Escape') {
        setSelectedDrawingId(null);
        setActiveDrawingTool(null);
        drawingPointsRef.current = [];
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedDrawingId, setSelectedDrawingId, setActiveDrawingTool]);

  const canvasCursor = activeDrawingTool
    ? 'crosshair'
    : selectedDrawingId
      ? 'default'
      : isRewindMode
        ? 'col-resize'
        : 'default';

  const displayBar = currentBar;
  const changePercent = displayBar && bars.length > 0 ? ((displayBar.close - bars[0].open) / bars[0].open) * 100 : 0;
  const isUp = displayBar ? displayBar.close >= displayBar.open : true;

  const chartColors = getChartColors(theme);

  return (
    <div className="h-full w-full relative" style={{ background: chartColors.bg }}>
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '200px' }} />
      {/* Drawing canvas */}
      <canvas
        ref={drawingCanvasRef}
        className="absolute inset-0 w-full h-full z-[5]"
        style={{
          pointerEvents: selectedDrawingId ? 'auto' : 'none',
          cursor: canvasCursor,
        }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerLeave={handleCanvasPointerUp}
        onDoubleClick={handleCanvasDoubleClick}
      />

      {/* Text editing overlay */}
      {editingTextId && editingTextPos && (
        <input
          autoFocus
          className="absolute z-20 bg-gray-900/95 border border-blue-500/70 text-white text-xs px-2 py-1 outline-none rounded-sm"
          style={{ left: editingTextPos.x + 4, top: editingTextPos.y - 24, minWidth: '100px' }}
          value={editingTextValue}
          onChange={(e) => setEditingTextValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTextEdit();
            if (e.key === 'Escape') { setEditingTextId(null); setEditingTextPos(null); }
          }}
          onBlur={commitTextEdit}
        />
      )}

      {/* OHLCV Overlay + Buy/Sell buttons — shifted 10px right */}
      <div className="absolute top-2 z-10 pointer-events-none select-none" style={{ left: '22px' }}>
        {displayBar && (
          <div className="flex items-center gap-2.5 text-xs flex-wrap">
            <span className="text-gray-300 font-semibold">{symbol}</span>
            <span className={cn('font-medium', isUp ? 'text-emerald-400' : 'text-red-400')}>O <span className="text-gray-300 ml-0.5">{fmtPrice(displayBar.open)}</span></span>
            <span className={cn('font-medium', isUp ? 'text-emerald-400' : 'text-red-400')}>H <span className="text-gray-300 ml-0.5">{fmtPrice(displayBar.high)}</span></span>
            <span className={cn('font-medium', isUp ? 'text-emerald-400' : 'text-red-400')}>L <span className="text-gray-300 ml-0.5">{fmtPrice(displayBar.low)}</span></span>
            <span className={cn('font-medium', isUp ? 'text-emerald-400' : 'text-red-400')}>C <span className="text-gray-300 ml-0.5">{fmtPrice(displayBar.close)}</span></span>
            <span className={cn('font-medium', changePercent >= 0 ? 'text-emerald-400' : 'text-red-400')}>{changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%</span>
            <span className="text-gray-400 hidden sm:inline">Vol <span className="text-gray-300 ml-0.5">{fmtVolume(displayBar.volume)}</span></span>

            {/* Buy/Sell buttons adjacent to OHLCV — shifted to match OHLCV */}
            <span className="pointer-events-auto inline-flex items-center gap-1.5 ml-1.5 max-md:hidden">
              <Button
                className="h-6 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] rounded shadow-lg shadow-emerald-600/20"
                onClick={(e) => { e.stopPropagation(); setOrderDialogSide('buy'); setShowOrderDialog(true); }}
              >BUY</Button>
              <Button
                className="h-6 px-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[9px] rounded shadow-lg shadow-red-600/20"
                onClick={(e) => { e.stopPropagation(); setOrderDialogSide('sell'); setShowOrderDialog(true); }}
              >SELL</Button>
            </span>
          </div>
        )}
      </div>

      {/* Mobile Buy/Sell toggle + buttons */}
      <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5 md:hidden">
        {showMobileBuySell && (
          <span className="inline-flex items-center gap-1">
            <Button
              className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded shadow-lg shadow-emerald-600/20"
              onClick={(e) => { e.stopPropagation(); setOrderDialogSide('buy'); setShowOrderDialog(true); }}
            >BUY</Button>
            <Button
              className="h-7 px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] rounded shadow-lg shadow-red-600/20"
              onClick={(e) => { e.stopPropagation(); setOrderDialogSide('sell'); setShowOrderDialog(true); }}
            >SELL</Button>
          </span>
        )}
        <button
          className="size-7 flex items-center justify-center bg-gray-800/80 rounded text-gray-400 hover:text-gray-200 border border-gray-700/50"
          onClick={toggleMobileBuySell}
        >
          {showMobileBuySell ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>

      {crosshairData && (
        <div className="absolute top-7 z-10 pointer-events-none select-none" style={{ left: '22px' }}>
          <div className="flex items-center gap-3 text-xs opacity-70">
            <span className="text-gray-500">{crosshairData.time}</span>
            <span className="text-gray-400">O {fmtPrice(crosshairData.o)}</span>
            <span className="text-gray-400">H {fmtPrice(crosshairData.h)}</span>
            <span className="text-gray-400">L {fmtPrice(crosshairData.l)}</span>
            <span className="text-gray-400">C {fmtPrice(crosshairData.c)}</span>
            <span className="text-gray-500 hidden sm:inline">V {fmtVolume(crosshairData.v)}</span>
          </div>
        </div>
      )}

      {/* Rewind mode indicator */}
      {isRewindMode && (
        <div className="absolute top-2 right-3 z-10 pointer-events-none select-none max-md:hidden">
          <div className="flex items-center gap-1.5 text-amber-500/40 px-2 py-1 text-[10px] font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500/40" />
            REPLAY
          </div>
        </div>
      )}

      {/* Fullscreen Toggle — lower-left corner of chart only */}
      <div className="absolute bottom-3 left-3 z-10">
        <button
          className="size-7 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 border transition-colors"
          style={{ background: theme === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(31,41,55,0.6)', borderColor: theme === 'light' ? 'rgba(209,213,219,0.5)' : 'rgba(55,65,81,0.3)' }}
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}