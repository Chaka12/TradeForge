'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useSimulationStore } from '@/stores/simulation-store';
import { useChartStore } from '@/stores/chart-store';
import { useAppStore } from '@/stores/app-store';
import type { OrderType, OrderSide } from '@/types/trading';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'market', label: 'Market' },
  { value: 'limit', label: 'Limit' },
  { value: 'stop', label: 'Stop' },
  { value: 'stop_limit', label: 'Stop Limit' },
];

// ---------------------------------------------------------------------------
// OrderDialog
// ---------------------------------------------------------------------------

export function OrderDialog() {
  const showOrderDialog = useAppStore((s) => s.showOrderDialog);
  const setShowOrderDialog = useAppStore((s) => s.setShowOrderDialog);
  const orderDialogSide = useAppStore((s) => s.orderDialogSide);
  const addToast = useAppStore((s) => s.addToast);

  const symbol = useChartStore((s) => s.symbol);
  const placeOrder = useSimulationStore((s) => s.placeOrder);
  const currentBar = useSimulationStore((s) => s.currentBar);
  const isRewindMode = useChartStore((s) => s.isRewindMode);
  const bars = useChartStore((s) => s.bars);
  const currentBarIndex = useChartStore((s) => s.currentBarIndex);

  // In replay mode, use the visible (last revealed) bar's close price
  const replayBar = isRewindMode && currentBarIndex >= 0 && currentBarIndex < bars.length
    ? bars[currentBarIndex]
    : null;
  const displayPrice = replayBar ? replayBar.close : (currentBar?.close ?? null);

  // Form state
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showPriceField = orderType === 'limit' || orderType === 'stop_limit';
  const showStopPriceField = orderType === 'stop' || orderType === 'stop_limit';

  const resetForm = useCallback(() => {
    setOrderType('market');
    setQuantity('1');
    setPrice('');
    setStopPrice('');
    setStopLoss('');
    setTakeProfit('');
    setErrors({});
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0';
    }

    if (showPriceField) {
      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) {
        newErrors.price = 'Price must be greater than 0';
      }
    }

    if (showStopPriceField) {
      const sp = parseFloat(stopPrice);
      if (isNaN(sp) || sp <= 0) {
        newErrors.stopPrice = 'Stop price must be greater than 0';
      }
    }

    if (stopLoss) {
      const sl = parseFloat(stopLoss);
      if (isNaN(sl) || sl <= 0) {
        newErrors.stopLoss = 'Stop loss must be greater than 0';
      }
    }

    if (takeProfit) {
      const tp = parseFloat(takeProfit);
      if (isNaN(tp) || tp <= 0) {
        newErrors.takeProfit = 'Take profit must be greater than 0';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (side: OrderSide) => {
    if (!validate()) return;

    try {
      placeOrder({
        accountId: 'sim_account_1',
        symbol,
        side,
        type: orderType,
        quantity: parseFloat(quantity),
        price: showPriceField ? parseFloat(price) : null,
        stopPrice: showStopPriceField ? parseFloat(stopPrice) : null,
        createdAt: Math.floor(Date.now() / 1000),
      });

      const typeLabel = ORDER_TYPES.find((t) => t.value === orderType)?.label ?? orderType;
      addToast(
        `${side === 'buy' ? 'Buy' : 'Sell'} ${typeLabel} order placed for ${quantity} ${symbol}`,
        'success'
      );

      resetForm();
      setShowOrderDialog(false);
    } catch (err) {
      addToast(
        `Failed to place order: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      );
    }
  };

  const currentPriceStr = displayPrice !== null ? displayPrice.toFixed(2) : '—';

  return (
    <Dialog open={showOrderDialog} onOpenChange={(open) => {
      if (!open) {
        resetForm();
        setShowOrderDialog(false);
      }
    }}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white sm:max-w-md p-4 gap-0">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-sm font-semibold text-white">
            Place Order — {symbol}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            {isRewindMode && <span className="text-amber-400/70 mr-1">REPLAY</span>}
            Current price: <span className="font-mono text-gray-300">${currentPriceStr}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Order Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">
              Order Type
            </label>
            <Select
              value={orderType}
              onValueChange={(v) => setOrderType(v as OrderType)}
            >
              <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-white w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {ORDER_TYPES.map((t) => (
                  <SelectItem
                    key={t.value}
                    value={t.value}
                    className="text-xs text-gray-200 focus:bg-gray-700 focus:text-white"
                  >
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">
              Quantity
            </label>
            <Input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={cn(
                'h-8 text-xs bg-gray-800 border-gray-700 text-white font-mono',
                errors.quantity && 'border-red-500'
              )}
              placeholder="1"
            />
            {errors.quantity && (
              <span className="text-[10px] text-red-400">{errors.quantity}</span>
            )}
          </div>

          {/* Price (Limit / Stop Limit) */}
          {showPriceField && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider">
                Price
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={cn(
                  'h-8 text-xs bg-gray-800 border-gray-700 text-white font-mono',
                  errors.price && 'border-red-500'
                )}
                placeholder="0.00"
              />
              {errors.price && (
                <span className="text-[10px] text-red-400">{errors.price}</span>
              )}
            </div>
          )}

          {/* Stop Price (Stop / Stop Limit) */}
          {showStopPriceField && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider">
                Stop Price
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className={cn(
                  'h-8 text-xs bg-gray-800 border-gray-700 text-white font-mono',
                  errors.stopPrice && 'border-red-500'
                )}
                placeholder="0.00"
              />
              {errors.stopPrice && (
                <span className="text-[10px] text-red-400">{errors.stopPrice}</span>
              )}
            </div>
          )}

          <Separator className="bg-gray-800" />

          {/* Stop Loss / Take Profit */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider">
                Stop Loss
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className={cn(
                  'h-8 text-xs bg-gray-800 border-gray-700 text-white font-mono',
                  errors.stopLoss && 'border-red-500'
                )}
                placeholder="Optional"
              />
              {errors.stopLoss && (
                <span className="text-[10px] text-red-400">{errors.stopLoss}</span>
              )}
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider">
                Take Profit
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className={cn(
                  'h-8 text-xs bg-gray-800 border-gray-700 text-white font-mono',
                  errors.takeProfit && 'border-red-500'
                )}
                placeholder="Optional"
              />
              {errors.takeProfit && (
                <span className="text-[10px] text-red-400">{errors.takeProfit}</span>
              )}
            </div>
          </div>

          <Separator className="bg-gray-800" />

          {/* Submit Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              className={cn(
                'flex-1 h-9 text-sm font-bold',
                orderDialogSide === 'buy'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/30'
                  : 'bg-gray-700 hover:bg-gray-600 text-emerald-400'
              )}
              onClick={() => handleSubmit('buy')}
            >
              Buy
            </Button>
            <Button
              className={cn(
                'flex-1 h-9 text-sm font-bold',
                orderDialogSide === 'sell'
                  ? 'bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-400/30'
                  : 'bg-gray-700 hover:bg-gray-600 text-red-400'
              )}
              onClick={() => handleSubmit('sell')}
            >
              Sell
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
