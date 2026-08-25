'use client';

import { X, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSimulationStore } from '@/stores/simulation-store';
import type { Order, OrderSide, OrderType } from '@/types/trading';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sideColor: Record<OrderSide, string> = {
  buy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  sell: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const typeLabel: Record<OrderType, string> = {
  market: 'MKT',
  limit: 'LMT',
  stop: 'STP',
  stop_limit: 'STP LMT',
};

function formatPrice(value: number | null): string {
  if (value === null) return '—';
  return value.toFixed(2);
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}

// ---------------------------------------------------------------------------
// OrderRow
// ---------------------------------------------------------------------------

function OrderRow({ order, onCancel }: { order: Order; onCancel: () => void }) {
  return (
    <div className="flex items-center justify-between p-2 border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs text-gray-300 font-semibold truncate">
          {order.symbol}
        </span>
        <Badge
          className={cn(
            'text-[10px] px-1.5 py-0 font-bold uppercase',
            sideColor[order.side]
          )}
          variant="outline"
        >
          {order.side}
        </Badge>
        <Badge
          className="text-[10px] px-1.5 py-0 font-semibold uppercase bg-gray-700/50 text-gray-300 border-gray-600/30"
          variant="outline"
        >
          {typeLabel[order.type]}
        </Badge>
        <span className="text-xs text-gray-500 font-mono">
          {order.quantity}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] text-gray-500">Price</div>
          <div className="text-xs font-mono text-gray-300">
            {order.type === 'market' ? 'Market' : formatPrice(order.price)}
          </div>
        </div>
        {(order.type === 'stop' || order.type === 'stop_limit') && (
          <div className="text-right">
            <div className="text-[10px] text-gray-500">Stop</div>
            <div className="text-xs font-mono text-amber-400">
              {formatPrice(order.stopPrice)}
            </div>
          </div>
        )}
        <div className="text-right">
          <div className="text-[10px] text-gray-500">Time</div>
          <div className="text-[10px] font-mono text-gray-500">
            {formatTime(order.createdAt)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-gray-500 hover:text-red-400 hover:bg-red-500/10"
          onClick={onCancel}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrdersPanel
// ---------------------------------------------------------------------------

export function OrdersPanel() {
  const pendingOrders = useSimulationStore((s) => s.pendingOrders);
  const cancelOrder = useSimulationStore((s) => s.cancelOrder);

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Pending Orders
        </h3>
      </div>

      {pendingOrders.length === 0 ? (
        <div className="px-3 py-10 flex flex-col items-center justify-center gap-2">
          <Clock className="h-8 w-8 text-gray-600" />
          <p className="text-xs text-gray-500">No pending orders</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {pendingOrders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              onCancel={() => cancelOrder(order.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
