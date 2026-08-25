'use client';

import { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSimulationStore } from '@/stores/simulation-store';
import type { Trade } from '@/types/trading';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

// ---------------------------------------------------------------------------
// OpenTradeRow
// ---------------------------------------------------------------------------

function OpenTradeRow({
  trade,
  currentPrice,
  onClose,
}: {
  trade: Trade;
  currentPrice: number | null;
  onClose: () => void;
}) {
  const pnl =
    currentPrice !== null
      ? trade.side === 'long'
        ? (currentPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - currentPrice) * trade.quantity
      : 0;

  return (
    <div className="flex items-center justify-between p-2 border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs text-gray-300 font-semibold truncate">
          {trade.symbol}
        </span>
        <Badge
          className={cn(
            'text-[10px] px-1.5 py-0 font-bold uppercase',
            trade.side === 'long'
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border-red-500/30'
          )}
          variant="outline"
        >
          {trade.side}
        </Badge>
        <span className="text-xs text-gray-500 font-mono">
          {trade.quantity}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] text-gray-500">Entry</div>
          <div className="text-xs font-mono text-gray-300">
            {formatPrice(trade.entryPrice)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-500">Current</div>
          <div className="text-xs font-mono text-gray-300">
            {currentPrice !== null ? formatPrice(currentPrice) : '—'}
          </div>
        </div>
        <div className="text-right min-w-[70px]">
          <div className="text-[10px] text-gray-500">P&L</div>
          <div
            className={cn(
              'text-xs font-mono font-bold',
              pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {formatCurrency(pnl)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-gray-500 hover:text-red-400 hover:bg-red-500/10"
          onClick={onClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClosedTradeRow
// ---------------------------------------------------------------------------

function ClosedTradeRow({ trade }: { trade: Trade }) {
  const pnl = trade.pnl ?? 0;

  return (
    <div className="flex items-center justify-between p-2 border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs text-gray-300 font-semibold truncate">
          {trade.symbol}
        </span>
        <Badge
          className={cn(
            'text-[10px] px-1.5 py-0 font-bold uppercase',
            trade.side === 'long'
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border-red-500/30'
          )}
          variant="outline"
        >
          {trade.side}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] text-gray-500">Entry</div>
          <div className="text-xs font-mono text-gray-400">
            {formatPrice(trade.entryPrice)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-500">Exit</div>
          <div className="text-xs font-mono text-gray-400">
            {trade.exitPrice !== null ? formatPrice(trade.exitPrice) : '—'}
          </div>
        </div>
        <div className="text-right min-w-[70px]">
          <div className="text-[10px] text-gray-500">P&L</div>
          <div
            className={cn(
              'text-xs font-mono font-bold',
              pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {formatCurrency(pnl)}
          </div>
        </div>
        <div className="text-right min-w-[60px]">
          <div className="text-[10px] text-gray-500">Comm.</div>
          <div className="text-xs font-mono text-gray-500">
            -${trade.commission.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PositionsPanel
// ---------------------------------------------------------------------------

export function PositionsPanel() {
  const openTrades = useSimulationStore((s) => s.openTrades);
  const closedTrades = useSimulationStore((s) => s.closedTrades);
  const currentBar = useSimulationStore((s) => s.currentBar);
  const closeTrade = useSimulationStore((s) => s.closeTrade);

  const [showClosed, setShowClosed] = useState(false);

  const currentPrice = currentBar?.close ?? null;

  // Compute total unrealized P&L
  const totalUnrealizedPnl = useMemo(() => {
    if (currentPrice === null) return 0;
    return openTrades.reduce((sum, trade) => {
      if (trade.side === 'long') {
        return sum + (currentPrice - trade.entryPrice) * trade.quantity;
      } else {
        return sum + (trade.entryPrice - currentPrice) * trade.quantity;
      }
    }, 0);
  }, [openTrades, currentPrice]);

  // Compute total realized P&L
  const totalRealizedPnl = useMemo(() => {
    return closedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  }, [closedTrades]);

  return (
    <div className="flex flex-col">
      {/* Open Positions */}
      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Open Positions
        </h3>
      </div>

      {openTrades.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="text-xs text-gray-500">No open positions</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {openTrades.map((trade) => (
            <OpenTradeRow
              key={trade.id}
              trade={trade}
              currentPrice={currentPrice}
              onClose={() => closeTrade(trade.id)}
            />
          ))}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-800/40">
            <span className="text-xs text-gray-400">Total Unrealized P&L</span>
            <span
              className={cn(
                'text-sm font-mono font-bold',
                totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {formatCurrency(totalUnrealizedPnl)}
            </span>
          </div>
        </div>
      )}

      <Separator className="bg-gray-800 my-1" />

      {/* Closed Positions (collapsible) */}
      <button
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-800/50 transition-colors"
        onClick={() => setShowClosed(!showClosed)}
      >
        {showClosed ? (
          <ChevronDown className="h-3 w-3 text-gray-400" />
        ) : (
          <ChevronRight className="h-3 w-3 text-gray-400" />
        )}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Closed Positions ({closedTrades.length})
        </h3>
      </button>

      {showClosed && (
        <div className="flex flex-col">
          {closedTrades.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-gray-500">No closed trades</p>
            </div>
          ) : (
            <>
              {closedTrades.map((trade) => (
                <ClosedTradeRow key={trade.id} trade={trade} />
              ))}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-800/40">
                <span className="text-xs text-gray-400">Total Realized P&L</span>
                <span
                  className={cn(
                    'text-sm font-mono font-bold',
                    totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  )}
                >
                  {formatCurrency(totalRealizedPnl)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
