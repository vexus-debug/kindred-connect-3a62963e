import { useState, useCallback, useRef, useEffect } from 'react';
import { fetchTickers, fetchKlines } from '@/lib/bybit-api';
import { detectPureFVGs, type FVGScanResult } from '@/lib/fvg-scanner';
import type { Timeframe } from '@/types/scanner';

const FVG_TIMEFRAMES: Timeframe[] = ['60', '240', 'D'];
const TOP_SYMBOLS = 500; // scan all USDT pairs
const BATCH_SIZE = 5;
const SCAN_INTERVAL = 60 * 60 * 1000; // 1 hour

export function useFVGScanner() {
  const [results, setResults] = useState<FVGScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(0);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const scanRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const runScan = useCallback(async () => {
    if (scanRef.current) return;
    scanRef.current = true;
    setScanning(true);

    try {
      const tickerData = await fetchTickers('linear');
      if (tickerData.retCode !== 0 || !tickerData.result?.list) return;

      const symbols = tickerData.result.list
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
        .slice(0, TOP_SYMBOLS);

      setProgress({ current: 0, total: symbols.length });
      const allResults: FVGScanResult[] = [];

      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (ticker) => {
          const sym = ticker.symbol;
          const price = parseFloat(ticker.lastPrice);
          const change = parseFloat(ticker.price24hPcnt) * 100;

          for (const tf of FVG_TIMEFRAMES) {
            try {
              const candles = await fetchKlines(sym, tf, 'linear', 200);
              if (candles.length < 10) continue;

              const fvgs = detectPureFVGs(candles, tf);
              if (fvgs.length === 0) continue;

              const bullish = fvgs.filter(f => f.type === 'bullish');
              const bearish = fvgs.filter(f => f.type === 'bearish');

              // Find nearest unfilled FVG to current price
              let nearest = fvgs[0];
              let minDist = Math.abs(price - fvgs[0].midpoint);
              for (const f of fvgs) {
                const d = Math.abs(price - f.midpoint);
                if (d < minDist) { minDist = d; nearest = f; }
              }

              allResults.push({
                symbol: sym,
                price,
                change24h: change,
                timeframe: tf,
                fvgs,
                bullishCount: bullish.length,
                bearishCount: bearish.length,
                strongestFVG: fvgs[0] || null,
                nearestFVG: nearest || null,
                distToNearest: nearest ? ((price - nearest.midpoint) / price) * 100 : null,
              });
            } catch { /* skip */ }
          }
        });

        await Promise.all(batchPromises);
        setProgress({ current: Math.min(i + BATCH_SIZE, symbols.length), total: symbols.length });

        if (i + BATCH_SIZE < symbols.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // Sort by strongest FVG strength
      allResults.sort((a, b) => (b.strongestFVG?.strength ?? 0) - (a.strongestFVG?.strength ?? 0));
      setResults(allResults);
      setLastScan(Date.now());
    } catch (err) {
      console.error('FVG scan error:', err);
    } finally {
      scanRef.current = false;
      setScanning(false);
    }
  }, []);

  // Auto-scan on mount and every hour
  useEffect(() => {
    runScan();
    intervalRef.current = setInterval(runScan, SCAN_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [runScan]);

  return { results, scanning, lastScan, progress, runScan };
}
