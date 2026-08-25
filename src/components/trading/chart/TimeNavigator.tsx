'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useChartStore } from '@/stores/chart-store';
import { useSimulationStore } from '@/stores/simulation-store';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { SkipBack, Play, Pause, SkipForward, Gauge, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEED_OPTIONS = [1, 2, 5, 10, 25, 50];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimeNavigator() {
  const theme = useAppStore((s) => s.theme);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);

  // Store selectors
  const bars = useChartStore((s) => s.bars);
  const currentBarIndex = useChartStore((s) => s.currentBarIndex);
  const isPlaying = useChartStore((s) => s.isPlaying);
  const playbackSpeed = useChartStore((s) => s.playbackSpeed);
  const isRewindMode = useChartStore((s) => s.isRewindMode);

  const setIsPlaying = useChartStore((s) => s.setIsPlaying);
  const setPlaybackSpeed = useChartStore((s) => s.setPlaybackSpeed);
  const setCurrentBarIndex = useChartStore((s) => s.setCurrentBarIndex);
  const setIsRewindMode = useChartStore((s) => s.setIsRewindMode);

  const stepForward = useSimulationStore((s) => s.stepForward);
  const stepBackward = useSimulationStore((s) => s.stepBackward);
  const currentBar = useSimulationStore((s) => s.currentBar);

  const totalBars = bars.length;
  const maxIndex = Math.max(0, totalBars - 1);
  const progress = totalBars > 0 ? Math.max(0, Math.min(currentBarIndex, maxIndex)) : 0;
  const isAtEnd = totalBars > 0 && currentBarIndex >= maxIndex;

  // ---- Playback interval ----
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && !isAtEnd) {
      const interval = Math.max(20, 1000 / playbackSpeed);
      intervalRef.current = setInterval(() => {
        const { currentBarIndex: idx, bars: b } = useChartStore.getState();
        if (idx >= b.length - 1) {
          setIsPlaying(false);
          return;
        }
        stepForward();
        setCurrentBarIndex(idx + 1);
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, isAtEnd, stepForward, setCurrentBarIndex, setIsPlaying]);

  // ---- Step backward ----
  const handleStepBack = useCallback(() => {
    if (currentBarIndex <= 0) return;
    stepBackward();
    setCurrentBarIndex(currentBarIndex - 1);
  }, [currentBarIndex, stepBackward, setCurrentBarIndex]);

  // ---- Step forward ----
  const handleStepForward = useCallback(() => {
    if (currentBarIndex >= maxIndex) return;
    stepForward();
    setCurrentBarIndex(currentBarIndex + 1);
  }, [currentBarIndex, maxIndex, stepForward, setCurrentBarIndex]);

  // ---- Toggle play/pause ----
  const handlePlayPause = useCallback(() => {
    if (isAtEnd && !isPlaying) {
      // At end and paused: in rewind mode restart from current position, else restart from 0
      const startPos = isRewindMode ? Math.max(0, currentBarIndex) : 0;
      useSimulationStore.getState().advanceToBar(startPos);
      setCurrentBarIndex(startPos);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, isAtEnd, isRewindMode, currentBarIndex, setIsPlaying, setCurrentBarIndex]);

  // ---- Slider change ----
  const handleSliderChange = useCallback(
    (value: number[]) => {
      const newIndex = value[0];
      if (newIndex === currentBarIndex) return;
      setCurrentBarIndex(newIndex);
      useSimulationStore.getState().advanceToBar(newIndex);
    },
    [currentBarIndex, setCurrentBarIndex],
  );

  // ---- Toggle rewind mode ----
  const handleToggleRewind = useCallback(() => {
    if (isRewindMode) {
      // Exit rewind: show all bars, jump to end
      setIsRewindMode(false);
      setCurrentBarIndex(Math.max(0, bars.length - 1));
      if (bars.length > 0) useSimulationStore.getState().advanceToBar(bars.length - 1);
    } else {
      // Enter rewind: set ruler to current position (or end)
      const startIdx = Math.max(0, Math.min(currentBarIndex, bars.length - 1));
      setIsRewindMode(true);
      setCurrentBarIndex(startIdx);
      if (bars.length > 0) useSimulationStore.getState().advanceToBar(startIdx);
    }
  }, [isRewindMode, currentBarIndex, bars.length, setIsRewindMode, setCurrentBarIndex]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handleStepBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleStepForward();
          break;
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleStepBack, handleStepForward, handlePlayPause]);

  // ---- Format date ----
  const currentDateStr = currentBar
    ? new Date(currentBar.time * 1000).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  const currentTimeStr = currentBar
    ? new Date(currentBar.time * 1000).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="h-10 flex items-center px-3 gap-3" style={{ background: theme === 'light' ? '#f9fafb' : '#111118', borderTop: `1px solid ${theme === 'light' ? '#e5e7eb' : '#1e1e3a'}` }}>
      {/* ── Rewind Toggle ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-7',
              isRewindMode
                ? 'text-amber-400 hover:text-amber-300 bg-amber-500/15 ring-1 ring-amber-500/40'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
            )}
            onClick={handleToggleRewind}
          >
            {isRewindMode ? <X className="size-3.5" /> : <RotateCcw className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{isRewindMode ? 'Exit Replay' : 'Replay Mode'}</p>
        </TooltipContent>
      </Tooltip>

      {/* Rewind mode indicator */}
      {isRewindMode && (
        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
          REPLAY
        </span>
      )}

      <div className="w-px h-5 bg-gray-700/50" />

      {/* Step Backward */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-gray-400 hover:text-gray-200 hover:bg-gray-800 disabled:opacity-30"
            disabled={currentBarIndex <= 0}
            onClick={handleStepBack}
          >
            <SkipBack className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Step Back (←)</p>
        </TooltipContent>
      </Tooltip>

      {/* Play / Pause */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-7',
              isPlaying
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
            )}
            onClick={handlePlayPause}
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{isPlaying ? 'Pause (Space)' : isAtEnd ? 'Restart' : 'Play (Space)'}</p>
        </TooltipContent>
      </Tooltip>

      {/* Step Forward */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-gray-400 hover:text-gray-200 hover:bg-gray-800 disabled:opacity-30"
            disabled={currentBarIndex >= maxIndex}
            onClick={handleStepForward}
          >
            <SkipForward className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Step Forward (→)</p>
        </TooltipContent>
      </Tooltip>

      <div className="w-px h-5 bg-gray-700/50" />

      {/* Speed Control */}
      <div className="flex items-center gap-1">
        <Gauge className="size-3.5 text-gray-500" />
        {SPEED_OPTIONS.map((speed) => (
          <Button
            key={speed}
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 px-1.5 text-[10px] font-mono font-medium',
              playbackSpeed === speed
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800',
            )}
            onClick={() => setPlaybackSpeed(speed)}
          >
            {speed}x
          </Button>
        ))}
      </div>

      <div className="w-px h-5 bg-gray-700/50" />

      {/* Progress Slider */}
      <div className="flex-1 flex items-center min-w-0">
        <Slider
          value={[progress]}
          min={0}
          max={maxIndex}
          step={1}
          onPointerDown={() => {
            isDraggingRef.current = true;
            if (isPlaying) setIsPlaying(false);
          }}
          onPointerUp={() => {
            isDraggingRef.current = false;
          }}
          onValueChange={handleSliderChange}
          disabled={totalBars === 0}
          className={cn(
            'w-full [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-gray-400 [&_[data-slot=slider-track]]:bg-gray-700',
            isRewindMode
              ? '[&_[data-slot=slider-range]]:bg-amber-500/80'
              : '[&_[data-slot=slider-range]]:bg-emerald-500/80',
          )}
        />
      </div>

      {/* Bar Counter */}
      {totalBars > 0 && (
        <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
          {Math.max(0, currentBarIndex + 1)}/{totalBars}
        </span>
      )}

      <div className="w-px h-5 bg-gray-700" />

      {/* Date Display */}
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-xs text-gray-300 font-medium">{currentDateStr}</span>
        {currentTimeStr && (
          <span className="text-xs text-gray-500">{currentTimeStr}</span>
        )}
      </div>
    </div>
  );
}
