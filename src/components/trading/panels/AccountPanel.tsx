'use client';

import { useState, useMemo } from 'react';
import { Wallet, TrendingUp, TrendingDown, DollarSign, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useSimulationStore } from '@/stores/simulation-store';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// AccountMetricCard
// ---------------------------------------------------------------------------

function AccountMetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div
        className={cn('text-lg font-mono font-bold', color ?? 'text-white')}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatRow
// ---------------------------------------------------------------------------

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={cn('text-xs font-mono font-semibold', color ?? 'text-white')}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DepositWithdrawForm
// ---------------------------------------------------------------------------

function DepositWithdrawForm({ mode }: { mode: 'deposit' | 'withdraw' }) {
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const addToast = useAppStore((s) => s.addToast);

  const isDeposit = mode === 'deposit';

  const handleSubmit = () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      addToast('Please enter a valid positive amount', 'error');
      return;
    }

    setIsSubmitting(true);

    // Simulate a brief delay for UX
    setTimeout(() => {
      addToast(
        `${isDeposit ? 'Deposited' : 'Withdrew'} $${num.toFixed(2)}`,
        'success'
      );
      setAmount('');
      setIsSubmitting(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
    }, 300);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 text-xs pl-7 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
        </div>
        <Button
          size="sm"
          disabled={isSubmitting || !amount}
          className={cn(
            'h-8 px-3 text-xs font-semibold',
            isDeposit
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          )}
          onClick={handleSubmit}
        >
          {submitted ? '✓' : isDeposit ? 'Deposit' : 'Withdraw'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccountPanel
// ---------------------------------------------------------------------------

export function AccountPanel() {
  const accountState = useSimulationStore((s) => s.accountState);
  const openTrades = useSimulationStore((s) => s.openTrades);
  const closedTrades = useSimulationStore((s) => s.closedTrades);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  // Trade statistics
  const stats = useMemo(() => {
    const totalTrades = openTrades.length + closedTrades.length;
    const closedCount = closedTrades.length;
    const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
    const losses = closedTrades.filter((t) => (t.pnl ?? 0) < 0);
    const winCount = wins.length;
    const lossCount = losses.length;
    const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;

    const totalWins = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const totalLosses = losses.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);

    const avgWin = winCount > 0 ? totalWins / winCount : 0;
    const avgLoss = lossCount > 0 ? totalLosses / lossCount : 0;

    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    return { totalTrades, closedCount, winRate, avgWin, avgLoss, profitFactor };
  }, [openTrades, closedTrades]);

  if (!accountState) {
    return (
      <div className="px-3 py-10 flex flex-col items-center justify-center gap-2">
        <Wallet className="h-8 w-8 text-gray-600" />
        <p className="text-xs text-gray-500">No account data</p>
      </div>
    );
  }

  const a = accountState;

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Account Summary Grid */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Account Summary
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <AccountMetricCard label="Balance" value={fmtCurrency(a.balance)} />
          <AccountMetricCard label="Equity" value={fmtCurrency(a.equity)} />
          <AccountMetricCard label="Margin" value={fmtCurrency(a.margin)} />
          <AccountMetricCard label="Free Margin" value={fmtCurrency(a.freeMargin)} />
          <AccountMetricCard
            label="Unrealized P&L"
            value={fmtCurrency(a.unrealizedPnl)}
            color={a.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <AccountMetricCard
            label="Realized P&L"
            value={fmtCurrency(a.realizedPnl)}
            color={a.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <AccountMetricCard
            label="Drawdown ($)"
            value={fmtCurrency(a.drawdown)}
            color={a.drawdown > 0 ? 'text-amber-400' : 'text-white'}
          />
          <AccountMetricCard
            label="Drawdown (%)"
            value={fmtPct(a.drawdownPercent)}
            color={a.drawdownPercent > 0 ? 'text-amber-400' : 'text-white'}
          />
        </div>
      </div>

      <Separator className="bg-gray-800" />

      {/* Deposit / Withdraw */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Funds
        </h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'flex-1 h-8 text-xs border-gray-700',
              showDeposit
                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/40'
                : 'text-emerald-400 hover:bg-emerald-600/10'
            )}
            onClick={() => {
              setShowDeposit(!showDeposit);
              setShowWithdraw(false);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Deposit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'flex-1 h-8 text-xs border-gray-700',
              showWithdraw
                ? 'bg-red-600/20 text-red-400 border-red-600/40'
                : 'text-red-400 hover:bg-red-600/10'
            )}
            onClick={() => {
              setShowWithdraw(!showWithdraw);
              setShowDeposit(false);
            }}
          >
            <Minus className="h-3 w-3 mr-1" />
            Withdraw
          </Button>
        </div>

        {showDeposit && <div className="mt-2"><DepositWithdrawForm mode="deposit" /></div>}
        {showWithdraw && <div className="mt-2"><DepositWithdrawForm mode="withdraw" /></div>}
      </div>

      <Separator className="bg-gray-800" />

      {/* Trade Statistics */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Trade Statistics
        </h3>
        <div className="bg-gray-800 rounded-lg p-3 flex flex-col">
          <StatRow label="Total Trades" value={String(stats.totalTrades)} />
          <StatRow
            label="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            color={stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatRow
            label="Avg Win"
            value={fmtCurrency(stats.avgWin)}
            color="text-emerald-400"
          />
          <StatRow
            label="Avg Loss"
            value={fmtCurrency(stats.avgLoss)}
            color="text-red-400"
          />
          <StatRow
            label="Profit Factor"
            value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
            color={stats.profitFactor >= 1.5 ? 'text-emerald-400' : stats.profitFactor > 0 ? 'text-amber-400' : 'text-red-400'}
          />
        </div>
      </div>
    </div>
  );
}
