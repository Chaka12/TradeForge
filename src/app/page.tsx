'use client';

import { useEffect, useCallback, useState } from 'react';
import TradingChart from '@/components/trading/chart/TradingChart';
import Toolbar from '@/components/trading/toolbar/Toolbar';
import TimeNavigator from '@/components/trading/chart/TimeNavigator';
import { SidebarPanel } from '@/components/trading/panels/SidebarPanel';
import { OrderDialog } from '@/components/trading/panels/OrderDialog';
import { AuthModal } from '@/components/AuthModal';
import { useChartStore } from '@/stores/chart-store';
import { useSimulationStore } from '@/stores/simulation-store';
import { useAppStore } from '@/stores/app-store';
import { useLiveFeed } from '@/hooks/useLiveFeed';
import { LIVE_SYMBOLS } from '@/lib/live-feed';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  User,
  LogOut,
} from 'lucide-react';

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const setBars = useChartStore((s) => s.setBars);
  const setCurrentBarIndex = useChartStore((s) => s.setCurrentBarIndex);
  const setIsRewindMode = useChartStore((s) => s.setIsRewindMode);
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const initialize = useSimulationStore((s) => s.initialize);
  const advanceToBar = useSimulationStore((s) => s.advanceToBar);
  const persistDrawings = useChartStore((s) => s.persistDrawings);
  const loadDrawings = useChartStore((s) => s.loadDrawings);

  const mobileMenuOpen = useAppStore((s) => s.mobileMenuOpen);
  const setMobileMenuOpen = useAppStore((s) => s.setMobileMenuOpen);
  const currentUser = useAppStore((s) => s.currentUser);
  const setShowAuthModal = useAppStore((s) => s.setShowAuthModal);
  const logout = useAppStore((s) => s.logout);
  const theme = useAppStore((s) => s.theme);
  const liveMode = useAppStore((s) => s.liveMode);

  // Detect mobile
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarVisible(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ---- Fetch bars and initialize simulation ----
  const loadBars = useCallback(async (preserveBarIndex: boolean = false) => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=5000`,
      );
      if (!res.ok) throw new Error('Failed to fetch bars');
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        setBars(json.data);
        setIsRewindMode(false);

        if (preserveBarIndex) {
          const prevIndex = useChartStore.getState().currentBarIndex;
          const newIndex = Math.min(prevIndex, json.data.length - 1);
          setCurrentBarIndex(Math.max(0, newIndex));
        } else {
          const lastIdx = json.data.length - 1;
          setCurrentBarIndex(lastIdx);
        }

        initialize(json.data, {
          initialBalance: 100000,
          commission: 0.001,
          slippage: 0.0005,
          startTime: json.data[0]?.time ?? 0,
          endTime: json.data[json.data.length - 1]?.time ?? 0,
          speed: 1,
        });

        const targetIdx = preserveBarIndex
          ? Math.min(useChartStore.getState().currentBarIndex, json.data.length - 1)
          : json.data.length - 1;
        if (targetIdx > 0) advanceToBar(targetIdx);

        // Load persisted drawings after data is set
        loadDrawings();
      }
    } catch (err) {
      console.error('Failed to load bars:', err);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, timeframe, setBars, setCurrentBarIndex, initialize, loadDrawings]);

  useEffect(() => {
    loadBars(false);
  }, [loadBars]);

  // Persist drawings before unload
  useEffect(() => {
    const handleBeforeUnload = () => { persistDrawings(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [persistDrawings]);

  // Auto-persist drawings periodically (every 10s)
  useEffect(() => {
    const interval = setInterval(() => { persistDrawings(); }, 10000);
    return () => clearInterval(interval);
  }, [persistDrawings]);

  // Live feed — streams real-time ticks when live mode is active
  const symbolHasLive = LIVE_SYMBOLS.has(symbol);
  useLiveFeed({
    enabled: liveMode && symbolHasLive,
    symbol,
    timeframe,
  });

  // Reload bars when live mode changes
  useEffect(() => {
    if (!liveMode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/live/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=500`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && !cancelled) {
          setBars(json.data);
          setCurrentBarIndex(json.data.length - 1);
        }
      } catch {
        // Live fetch failed — stay on current data
      }
    })();
    return () => { cancelled = true; };
  }, [liveMode, symbol, timeframe, setBars, setCurrentBarIndex]);

  // Toggle sidebar for mobile
  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setSidebarVisible(!sidebarVisible);
      setMobileMenuOpen(false);
    } else {
      setSidebarVisible(!sidebarVisible);
    }
  }, [isMobile, sidebarVisible, setMobileMenuOpen]);

  return (
    <div className={cn('flex flex-col w-screen overflow-hidden h-screen')} style={{ background: theme === 'light' ? '#f3f4f6' : '#0d0d14' }}>
      {/* Top Toolbar */}
      <Toolbar />

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Chart Area + Time Navigator */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Chart */}
          <main className="flex-1 min-h-0">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center" style={{ background: theme === 'light' ? '#ffffff' : '#13131a' }}>
                <div className="flex flex-col items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full bg-gray-300" />
                  <span className="text-sm text-gray-400">Loading chart data...</span>
                </div>
              </div>
            ) : (
              <TradingChart />
            )}
          </main>

          {/* Bottom Time Navigator — always visible (critical for replay) */}
          <TimeNavigator />

          {/* Controls overlay — above time navigator, bottom-left */}
          {!isLoading && (
            <div className="absolute bottom-14 left-3 z-20 flex items-center gap-1.5">
              {/* Sidebar toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 bg-gray-800/80 backdrop-blur-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700/80 border border-gray-700/50"
                    onClick={toggleSidebar}
                  >
                    {sidebarVisible ? (
                      <PanelLeftClose className="size-4" />
                    ) : (
                      <PanelLeftOpen className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{sidebarVisible ? 'Hide Panel' : 'Show Panel'}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Right Sidebar — as overlay on mobile, inline on desktop */}
        {sidebarVisible && (
          <>
            {/* Mobile backdrop */}
            {isMobile && (
              <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarVisible(false)} />
            )}
            <div className={cn(
              'z-40 shrink-0',
              isMobile
                ? 'fixed right-0 top-12 bottom-0 w-[360px] shadow-2xl'
                : 'relative'
            )}>
              <SidebarPanel />
            </div>
          </>
        )}
      </div>

      {/* Mobile hamburger button — top right on small screens */}
      {isMobile && !isLoading && (
        <div className="fixed top-3 right-3 z-50">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 bg-gray-800/80 backdrop-blur-sm text-gray-400 hover:text-gray-200 border border-gray-700/50"
            onClick={toggleSidebar}
          >
            <Menu className="size-4" />
          </Button>
        </div>
      )}

      {/* User button — floating top-right */ }
      {!isLoading && (
        <button
          className={cn(
            'z-10 flex items-center gap-1.5 px-2 h-7 rounded text-[11px] font-medium transition-colors',
            currentUser ? 'text-emerald-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-800'
          )}
          style={{ position: 'fixed', top: '50px', right: isMobile ? '60px' : '330px' }}
          onClick={() => setShowAuthModal(true)}
        >
          <div className={cn('size-5 rounded-full flex items-center justify-center', currentUser ? 'bg-emerald-600/20' : 'bg-gray-700')}>
            <User className="size-3" />
          </div>
          <span className={cn(isMobile && 'hidden')}>{currentUser ? currentUser.username : 'Sign In'}</span>
        </button>
      )}

      {/* Order Dialog */}
      <OrderDialog />

      {/* Auth Modal */}
      <AuthModal />

      {/* Toast Container */}
      <ToastContainer />
    </div>
  );
}

// ---- Simple Toast Container ----
function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-14 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto px-4 py-2.5 rounded-lg text-xs font-medium shadow-lg border backdrop-blur-sm animate-in slide-in-from-right-full fade-in duration-200',
            toast.type === 'success' && 'bg-emerald-900/90 border-emerald-700/50 text-emerald-200',
            toast.type === 'error' && 'bg-red-900/90 border-red-700/50 text-red-200',
            toast.type === 'info' && 'bg-gray-800/90 border-gray-700/50 text-gray-200',
          )}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}