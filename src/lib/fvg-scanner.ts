import type { Candle, Timeframe } from '@/types/scanner';

export interface PureFVG {
  type: 'bullish' | 'bearish';
  gapHigh: number;
  gapLow: number;
  midpoint: number;
  gapSize: number;
  gapPct: number;
  strength: number; // 0-100
  category: 'extreme' | 'strong' | 'moderate';
  candleIndex: number;
  formationTime: number;
  filled: boolean;
  fillPct: number;
  impulseBody: number; // body size of the impulse candle
  volumeRatio: number;
}

export interface FVGScanResult {
  symbol: string;
  price: number;
  change24h: number;
  timeframe: Timeframe;
  fvgs: PureFVG[];
  bullishCount: number;
  bearishCount: number;
  strongestFVG: PureFVG | null;
  nearestFVG: PureFVG | null;
  distToNearest: number | null; // pct
}

/**
 * Detect pure imbalance FVGs — no retracement into the gap.
 * Scans entire candle history, then checks if subsequent candles filled the gap.
 */
export function detectPureFVGs(candles: Candle[], timeframe: Timeframe): PureFVG[] {
  if (candles.length < 5) return [];

  const fvgs: PureFVG[] = [];

  // Calculate ATR for context
  let atrSum = 0;
  for (let i = 1; i < Math.min(candles.length, 15); i++) {
    atrSum += candles[i].high - candles[i].low;
  }
  const atr = atrSum / Math.min(candles.length - 1, 14);
  const minGap = atr * 0.5; // minimum gap size — only large imbalances
  const minImpulseBody = atr * 1.5; // impulse candle must be at least 1.5x ATR

  // Average volume for ratio
  const recentVols = candles.slice(-20).map(c => c.volume);
  const avgVol = recentVols.reduce((s, v) => s + v, 0) / recentVols.length;

  // Scan for FVGs (3-candle pattern: c0, c1 impulse, c2)
  for (let i = 1; i < candles.length - 1; i++) {
    const c0 = candles[i - 1];
    const c1 = candles[i]; // impulse candle
    const c2 = candles[i + 1];
    const volRatio = avgVol > 0 ? c1.volume / avgVol : 1;
    const impulseBody = Math.abs(c1.close - c1.open);

    // Bullish FVG: gap between c0.high and c2.low
    if (c2.low > c0.high && (c2.low - c0.high) > minGap && impulseBody > minImpulseBody) {
      const gapHigh = c2.low;
      const gapLow = c0.high;
      const gapSize = gapHigh - gapLow;
      const gapPct = (gapSize / gapLow) * 100;

      // Check fill — see if any subsequent candle's low entered the gap
      let filled = false;
      let fillPct = 0;
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].low < gapHigh) {
          const penetration = gapHigh - candles[j].low;
          fillPct = Math.min(100, (penetration / gapSize) * 100);
          if (fillPct > 20) { filled = true; break; }
        }
      }

      if (!filled) {
        const strength = calcFVGStrength(gapPct, volRatio, impulseBody, atr, candles.length - i);
        fvgs.push({
          type: 'bullish',
          gapHigh, gapLow, midpoint: (gapHigh + gapLow) / 2,
          gapSize, gapPct, strength,
          category: strength >= 75 ? 'extreme' : strength >= 50 ? 'strong' : 'moderate',
          candleIndex: i, formationTime: c1.time,
          filled, fillPct,
          impulseBody, volumeRatio: volRatio,
        });
      }
    }

    // Bearish FVG: gap between c2.high and c0.low
    if (c2.high < c0.low && (c0.low - c2.high) > minGap && impulseBody > minImpulseBody) {
      const gapHigh = c0.low;
      const gapLow = c2.high;
      const gapSize = gapHigh - gapLow;
      const gapPct = (gapSize / gapHigh) * 100;

      let filled = false;
      let fillPct = 0;
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].high > gapLow) {
          const penetration = candles[j].high - gapLow;
          fillPct = Math.min(100, (penetration / gapSize) * 100);
          if (fillPct > 20) { filled = true; break; }
        }
      }

      if (!filled) {
        const strength = calcFVGStrength(gapPct, volRatio, impulseBody, atr, candles.length - i);
        fvgs.push({
          type: 'bearish',
          gapHigh, gapLow, midpoint: (gapHigh + gapLow) / 2,
          gapSize, gapPct, strength,
          category: strength >= 75 ? 'extreme' : strength >= 50 ? 'strong' : 'moderate',
          candleIndex: i, formationTime: c1.time,
          filled, fillPct,
          impulseBody, volumeRatio: volRatio,
        });
      }
    }
  }

  // Sort by strength descending
  return fvgs.sort((a, b) => b.strength - a.strength);
}

function calcFVGStrength(
  gapPct: number,
  volRatio: number,
  impulseBody: number,
  atr: number,
  candlesAgo: number,
): number {
  // Gap size factor (bigger gap = stronger imbalance)
  const gapScore = Math.min(30, gapPct * 15);

  // Volume factor
  const volScore = Math.min(25, (volRatio - 1) * 15 + 10);

  // Impulse body relative to ATR
  const bodyRatio = atr > 0 ? impulseBody / atr : 1;
  const bodyScore = Math.min(25, bodyRatio * 12);

  // Recency factor (recent FVGs more relevant)
  const recencyScore = Math.min(20, Math.max(5, 20 - candlesAgo * 0.2));

  return Math.min(100, Math.round(gapScore + volScore + bodyScore + recencyScore));
}
