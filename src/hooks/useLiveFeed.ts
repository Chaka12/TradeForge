// ============================================================================
// useLiveFeed — Provider-agnostic WebSocket hook with tick-to-bar aggregation
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { useChartStore } from '@/stores/chart-store';
import { useAppStore } from '@/stores/app-store';
import { TIMEFRAMES, type Timeframe } from '@/types/trading';

interface UseLiveFeedOptions {
  enabled: boolean;
  symbol: string;
  timeframe: Timeframe;
}

export function useLiveFeed({ enabled, symbol, timeframe }: UseLiveFeedOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const barBufferRef = useRef<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    barStart: number;
  } | null>(null);
  const flushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setBars = useChartStore((s) => s.setBars);
  const setLiveConnected = useAppStore((s) => s.setLiveConnected);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Fetch WS config and subscribe messages in parallel
    Promise.all([
      fetch(`/api/live/config?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()),
      fetch(`/api/live/ws-messages?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()),
    ])
      .then(([config, msgs]) => {
        if (config.error) {
          console.error('[LiveFeed] Config error:', config.error);
          return;
        }

        const ws = new WebSocket(config.wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[LiveFeed] Connected to', config.provider);
          setLiveConnected(true);
          if (msgs.subscribe) ws.send(msgs.subscribe);
        };

        ws.onmessage = (event) => {
          const tick = parseProviderTick(event.data);
          if (!tick) return;

          const periodSeconds = TIMEFRAMES[timeframe]?.seconds ?? 86400;
          const barStart = Math.floor(tick.timestamp / periodSeconds) * periodSeconds;
          const buf = barBufferRef.current;

          if (!buf || buf.barStart !== barStart) {
            // Flush previous bar
            if (buf) flushBar(buf);
            // Start new bar
            barBufferRef.current = {
              open: tick.price,
              high: tick.price,
              low: tick.price,
              close: tick.price,
              volume: tick.volume,
              barStart,
            };
          } else {
            // Update running bar
            buf.high = Math.max(buf.high, tick.price);
            buf.low = Math.min(buf.low, tick.price);
            buf.close = tick.price;
            buf.volume += tick.volume;
          }
        };

        ws.onclose = () => {
          console.log('[LiveFeed] Disconnected');
          setLiveConnected(false);
          wsRef.current = null;
        };

        ws.onerror = (err) => {
          console.error('[LiveFeed] WebSocket error', err);
          setLiveConnected(false);
        };
      })
      .catch((err) => {
        console.error('[LiveFeed] Failed to get config:', err);
        setLiveConnected(false);
      });
  }, [enabled, symbol, timeframe, setLiveConnected]);

  const flushBar = useCallback(
    (bar: { open: number; high: number; low: number; close: number; volume: number; barStart: number }) => {
      const bars = useChartStore.getState().bars;
      if (bars.length === 0) return;
      const lastBar = bars[bars.length - 1];

      if (lastBar.time === bar.barStart) {
        // Update the last bar in-place
        useChartStore.getState().setBars([
          ...bars.slice(0, -1),
          { time: bar.barStart, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume },
        ]);
      } else if (bar.barStart > lastBar.time) {
        // Append new bar
        useChartStore.getState().setBars([
          ...bars,
          { time: bar.barStart, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume },
        ]);
      }
    },
    [],
  );

  // Connect/disconnect based on enabled
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      if (wsRef.current) {
        const sym = useChartStore.getState().symbol;
        fetch(`/api/live/ws-messages?symbol=${encodeURIComponent(sym)}`)
          .then((r) => r.json())
          .then((msgs) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && msgs.unsubscribe) {
              wsRef.current.send(msgs.unsubscribe);
            }
            wsRef.current?.close();
            wsRef.current = null;
          })
          .catch(() => {
            wsRef.current?.close();
            wsRef.current = null;
          });
      }
      setLiveConnected(false);
    }

    return () => {
      if (flushRef.current) clearInterval(flushRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setLiveConnected(false);
    };
  }, [enabled, connect, setLiveConnected]);

  // Periodic flush (every 2 seconds) to update chart with running bar
  useEffect(() => {
    if (flushRef.current) clearInterval(flushRef.current);
    if (!enabled) return;

    flushRef.current = setInterval(() => {
      if (barBufferRef.current) {
        flushBar(barBufferRef.current);
      }
    }, 2000);

    return () => {
      if (flushRef.current) {
        clearInterval(flushRef.current);
        flushRef.current = null;
      }
    };
  }, [enabled, flushBar]);
}

// ---------------------------------------------------------------------------
// Provider-agnostic tick parser
// Detects Twelve Data or Finnhub format from raw JSON
// ---------------------------------------------------------------------------

function parseProviderTick(raw: string): { price: number; volume: number; timestamp: number } | null {
  try {
    const msg = JSON.parse(raw);

    // Twelve Data price event
    if (msg.event === 'price' && msg.price) {
      return {
        price: parseFloat(msg.price),
        volume: parseFloat(msg.volume || '0'),
        timestamp: msg.timestamp
          ? Math.floor(new Date(msg.timestamp).getTime() / 1000)
          : Math.floor(Date.now() / 1000),
      };
    }

    // Finnhub trade event
    if (msg.type === 'trade' && msg.data && msg.data.length > 0) {
      const trade = msg.data[msg.data.length - 1];
      return {
        price: trade.p,
        volume: trade.v,
        timestamp: trade.t,
      };
    }

    return null;
  } catch {
    return null;
  }
}
