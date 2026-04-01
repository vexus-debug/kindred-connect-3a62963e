import { useState, useCallback, useRef } from 'react';
import { fetchTickers, fetchKlines } from '@/lib/bybit-api';
import {
  buildSnapshots,
  detectLeaders,
  findFollowers,
  buildCorrelationMap,
  formatLeaderAlert,
} from '@/lib/leader-lag';
import type {
  CoinSnapshot,
  LeaderCoin,
  LeaderLagSignal,
  LeaderLagSettings,
  LeaderLagTimeframe,
} from '@/types/leader-lag';
import { DEFAULT_LEADER_LAG_SETTINGS } from '@/types/leader-lag';
import type { Candle } from '@/types/scanner';

const BATCH_SIZE = 8;
const TOP_COUNT = 80;

function computeReturns(candles: Candle[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].close === 0) continue;
    returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close * 100);
  }
  return returns;
}

function computePriceChange(candles: Candle[], periods: number): number {
  if (candles.length < periods + 1) return 0;
  const recent = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - periods].close;
  if (past === 0) return 0;
  return ((recent - past) / past) * 100;
}

function computeVolumeRatio(candles: Candle[], lookback: number = 20): number {
  if (candles.length < lookback + 1) return 1;
  const recentVol = candles[candles.length - 1].volume;
  let sumVol = 0;
  for (let i = candles.length - 1 - lookback; i < candles.length - 1; i++) {
    sumVol += candles[i].volume;
  }
  const avgVol = sumVol / lookback;
  return avgVol === 0 ? 1 : recentVol / avgVol;
}

function computeMomentum(candles: Candle[]): number {
  if (candles.length < 14) return 0;
  // Simple RSI-based momentum
  let gains = 0, losses = 0;
  for (let i = candles.length - 14; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// Map LeaderLagTimeframe to Bybit kline interval
function mapInterval(tf: LeaderLagTimeframe): '1' | '3' | '5' | '15' {
  return tf;
}

export function useLeaderLag() {
  const [settings, setSettings] = useState<LeaderLagSettings>(DEFAULT_LEADER_LAG_SETTINGS);
  const [leaders, setLeaders] = useState<LeaderCoin[]>([]);
  const [signals, setSignals] = useState<LeaderLagSignal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastScan, setLastScan] = useState(0);
  const [alerts, setAlerts] = useState<string[]>([]);
  const scanningRef = useRef(false);

  const updateSettings = useCallback((updates: Partial<LeaderLagSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const scan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setAlerts([]);

    try {
      // 1. Fetch tickers
      const tickerData = await fetchTickers('linear');
      if (tickerData.retCode !== 0 || !tickerData.result?.list) return;

      const usdtTickers = tickerData.result.list
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
        .slice(0, TOP_COUNT);

      const symbols = usdtTickers.map(t => t.symbol);
      setProgress({ current: 0, total: symbols.length });

      // 2. Fetch klines for all symbols
      // Always fetch 1m candles; we compute change over N periods
      const interval = '1' as const;
      const allCandles = new Map<string, Candle[]>();

      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (sym) => {
            try {
              const candles = await fetchKlines(sym, interval, 'linear', 100);
              if (candles.length > 10) allCandles.set(sym, candles);
            } catch { /* skip */ }
          })
        );
        setProgress({ current: Math.min(i + BATCH_SIZE, symbols.length), total: symbols.length });
        if (i + BATCH_SIZE < symbols.length) {
          await new Promise(r => setTimeout(r, 150));
        }
      }

      // 3. Compute per-symbol metrics
      const periodsMap: Record<LeaderLagTimeframe, number> = { '1': 1, '3': 3, '5': 5, '15': 15 };
      const periods = periodsMap[settings.timeframe];

      const priceChanges = new Map<string, number>();
      const volumeRatios = new Map<string, number>();
      const momentumScores = new Map<string, number>();
      const returnSeries = new Map<string, number[]>();

      for (const [sym, candles] of allCandles) {
        priceChanges.set(sym, computePriceChange(candles, periods));
        volumeRatios.set(sym, computeVolumeRatio(candles));
        momentumScores.set(sym, computeMomentum(candles));
        returnSeries.set(sym, computeReturns(candles));
      }

      // 4. Build snapshots & detect leaders
      const snapshots = buildSnapshots(usdtTickers, priceChanges, volumeRatios, momentumScores);
      const detectedLeaders = detectLeaders(snapshots, settings);
      setLeaders(detectedLeaders);

      // 5. Build correlation map & find followers
      const corrMap = buildCorrelationMap(returnSeries, symbols);
      const allSignals: LeaderLagSignal[] = [];

      for (const leader of detectedLeaders.slice(0, 10)) {
        const followers = findFollowers(leader, snapshots, corrMap, settings);
        allSignals.push(...followers);
      }

      // Deduplicate by follower (keep strongest signal per follower)
      const bestByFollower = new Map<string, LeaderLagSignal>();
      for (const sig of allSignals) {
        const existing = bestByFollower.get(sig.follower.symbol);
        if (!existing || sig.signalStrength > existing.signalStrength) {
          bestByFollower.set(sig.follower.symbol, sig);
        }
      }

      const finalSignals = Array.from(bestByFollower.values())
        .sort((a, b) => b.signalStrength - a.signalStrength);

      setSignals(finalSignals);

      // 6. Generate alerts for top signals
      const newAlerts = finalSignals.slice(0, 5).map(formatLeaderAlert);
      setAlerts(newAlerts);

      setLastScan(Date.now());
    } catch (err) {
      console.error('Leader-lag scan error:', err);
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [settings]);

  return {
    settings,
    updateSettings,
    leaders,
    signals,
    scanning,
    progress,
    lastScan,
    alerts,
    scan,
  };
}
