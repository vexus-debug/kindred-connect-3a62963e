import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTickers, fetchKlines } from '@/lib/bybit-api';
import { analyzeTrend } from '@/lib/indicators';
import { shouldAlert, createAlert, sendBrowserNotification } from '@/lib/alerts';
import type {
  AssetTrend,
  AlertEntry,
  ScannerSettings,
  Timeframe,
  WatchlistItem,
} from '@/types/scanner';
import { ALL_TIMEFRAMES } from '@/types/scanner';

const MAX_ALERTS = 200;
const TOP_SYMBOLS_COUNT = 50;

export function useScanner(settings: ScannerSettings, watchlist: WatchlistItem[]) {
  const [assets, setAssets] = useState<Map<string, AssetTrend>>(new Map());
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const scanningRef = useRef(false);

  const addAlert = useCallback(
    (alert: AlertEntry) => {
      setAlerts((prev) => [alert, ...prev].slice(0, MAX_ALERTS));

      if (settings.browserNotifications) {
        const isWatched = watchlist.find((w) => w.symbol === alert.symbol && w.alertsEnabled);
        if (isWatched) {
          sendBrowserNotification(alert);
        }
      }
    },
    [settings.browserNotifications, watchlist]
  );

  const scanSymbol = useCallback(
    async (
      symbol: string,
      category: 'spot' | 'linear',
      price: number,
      change24h: number,
      volume24h: number,
      timeframes: Timeframe[]
    ) => {
      const signals: AssetTrend['signals'] = {};

      for (const tf of timeframes) {
        try {
          const candles = await fetchKlines(symbol, tf, category);
          if (candles.length < 50) continue;

          const signal = analyzeTrend(candles, settings.emaPeriods, settings.adxThreshold);
          if (signal) {
            signals[tf] = signal;

            const meetsStrength =
              settings.minStrength === 'weak' ||
              (settings.minStrength === 'moderate' && signal.strength !== 'weak') ||
              (settings.minStrength === 'strong' && signal.strength === 'strong');

            if (meetsStrength && shouldAlert(symbol, tf, signal.direction)) {
              const alert = createAlert(symbol, tf, signal.direction, signal.strength, price, signal.score);
              addAlert(alert);
            }
          }
        } catch {
          // Skip failed timeframes
        }
      }

      return { symbol, price, change24h, volume24h, signals, lastUpdated: Date.now(), marketType: category } as AssetTrend;
    },
    [settings, addAlert]
  );

  const runScan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);

    try {
      const categories: ('spot' | 'linear')[] =
        settings.marketFilter === 'both' ? ['linear', 'spot'] :
        [settings.marketFilter];

      const allSymbols: { symbol: string; category: 'spot' | 'linear'; price: number; change: number; vol: number }[] = [];

      for (const cat of categories) {
        try {
          const tickerData = await fetchTickers(cat);
          if (tickerData.retCode === 0 && tickerData.result?.list) {
            const sorted = tickerData.result.list
              .filter((t) => t.symbol.endsWith('USDT'))
              .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
              .slice(0, TOP_SYMBOLS_COUNT);

            for (const t of sorted) {
              allSymbols.push({
                symbol: t.symbol,
                category: cat,
                price: parseFloat(t.lastPrice),
                change: parseFloat(t.price24hPcnt) * 100,
                vol: parseFloat(t.volume24h),
              });
            }
          }
        } catch (err) {
          console.error(`Failed to fetch tickers for ${cat}:`, err);
        }
      }

      const symbolMap = new Map<string, typeof allSymbols[0]>();
      for (const s of allSymbols) {
        if (!symbolMap.has(s.symbol) || s.category === 'linear') {
          symbolMap.set(s.symbol, s);
        }
      }

      const uniqueSymbols = Array.from(symbolMap.values());
      setScanProgress({ current: 0, total: uniqueSymbols.length });

      const newAssets = new Map<string, AssetTrend>();

      const BATCH_SIZE = 3;
      for (let i = 0; i < uniqueSymbols.length; i += BATCH_SIZE) {
        const batch = uniqueSymbols.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((s) => scanSymbol(s.symbol, s.category, s.price, s.change, s.vol, ALL_TIMEFRAMES))
        );
        for (const result of results) {
          newAssets.set(result.symbol, result);
        }
        setScanProgress({ current: Math.min(i + BATCH_SIZE, uniqueSymbols.length), total: uniqueSymbols.length });

        if (i + BATCH_SIZE < uniqueSymbols.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      setAssets(newAssets);
      setLastScanTime(Date.now());
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [settings, scanSymbol]);

  useEffect(() => {
    runScan();

    intervalRef.current = setInterval(runScan, settings.scanInterval * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [settings.scanInterval, runScan]);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  return {
    assets: Array.from(assets.values()),
    alerts,
    scanning,
    lastScanTime,
    scanProgress,
    clearAlerts,
    runScan,
  };
}
