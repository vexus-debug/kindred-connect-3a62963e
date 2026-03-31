import type { Candle } from '@/types/scanner';
import type { SwingPoint } from './types';
import { calcATR } from './volatility-filter';

// ─── Trend Strength ───

export type TrendStrengthLevel = 'strong' | 'moderate' | 'weak' | 'exhausted';

export interface TrendStrengthResult {
  level: TrendStrengthLevel;
  score: number; // 0-100
  impulseSize: number;
  breakoutStrength: number;
  pullbackDepth: number;
}

export function measureTrendStrength(candles: Candle[], swings: SwingPoint[]): TrendStrengthResult {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  if (highs.length < 2 || lows.length < 2) {
    return { level: 'weak', score: 25, impulseSize: 0, breakoutStrength: 0, pullbackDepth: 0 };
  }

  const atr = calcATR(candles);
  if (atr === 0) return { level: 'weak', score: 25, impulseSize: 0, breakoutStrength: 0, pullbackDepth: 0 };

  // Impulse size: average of last 3 impulse legs normalized by ATR
  const impulses = getImpulseLegs(candles, swings);
  const recentImpulses = impulses.slice(-3);
  const avgImpulseATR = recentImpulses.length > 0
    ? recentImpulses.reduce((s, imp) => s + imp.size, 0) / recentImpulses.length / atr
    : 0;

  // Breakout strength: how far past structure price moved (last BOS)
  const lastHigh = highs[highs.length - 1];
  const prevHigh = highs.length >= 2 ? highs[highs.length - 2] : null;
  const lastLow = lows[lows.length - 1];
  const prevLow = lows.length >= 2 ? lows[lows.length - 2] : null;

  let breakoutStrength = 0;
  if (prevHigh && lastHigh.price > prevHigh.price) {
    breakoutStrength = (lastHigh.price - prevHigh.price) / atr;
  } else if (prevLow && lastLow.price < prevLow.price) {
    breakoutStrength = (prevLow.price - lastLow.price) / atr;
  }

  // Pullback depth: last pullback as % of last impulse
  let pullbackDepth = 0;
  if (impulses.length >= 1) {
    const lastImp = impulses[impulses.length - 1];
    const pullback = getPullbackAfterImpulse(candles, swings, lastImp);
    pullbackDepth = lastImp.size > 0 ? pullback / lastImp.size : 0;
  }

  // Score calculation
  const impulseScore = Math.min(40, avgImpulseATR * 10);
  const breakoutScore = Math.min(30, breakoutStrength * 10);
  const pullbackScore = Math.max(0, 30 - pullbackDepth * 40); // shallow pullback = stronger
  const score = Math.round(Math.min(100, impulseScore + breakoutScore + pullbackScore));

  let level: TrendStrengthLevel;
  if (score >= 75) level = 'strong';
  else if (score >= 50) level = 'moderate';
  else if (score >= 25) level = 'weak';
  else level = 'exhausted';

  return { level, score, impulseSize: avgImpulseATR, breakoutStrength, pullbackDepth };
}

// ─── Trend Age ───

export type TrendAge = 'fresh' | 'mature' | 'aging' | 'exhaustion';

export interface TrendAgeResult {
  candles: number;
  state: TrendAge;
}

export function measureTrendAge(candles: Candle[], swings: SwingPoint[]): TrendAgeResult {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  if (highs.length < 2 || lows.length < 2) return { candles: 0, state: 'fresh' };

  // Determine trend direction
  const bullish = highs[highs.length - 1].price > highs[highs.length - 2].price &&
                  lows[lows.length - 1].price > lows[lows.length - 2].price;
  const bearish = highs[highs.length - 1].price < highs[highs.length - 2].price &&
                  lows[lows.length - 1].price < lows[lows.length - 2].price;

  if (!bullish && !bearish) return { candles: 0, state: 'fresh' };

  // Walk backwards to find where the trend started
  let trendStartIndex = 0;
  if (bullish) {
    for (let i = lows.length - 2; i >= 1; i--) {
      if (lows[i].price < lows[i - 1].price) {
        // Trend broke here — trend started at i
        trendStartIndex = lows[i].index;
        break;
      }
    }
  } else {
    for (let i = highs.length - 2; i >= 1; i--) {
      if (highs[i].price > highs[i - 1].price) {
        trendStartIndex = highs[i].index;
        break;
      }
    }
  }

  const age = candles.length - 1 - trendStartIndex;
  let state: TrendAge;
  if (age < 20) state = 'fresh';
  else if (age < 50) state = 'mature';
  else if (age < 80) state = 'aging';
  else state = 'exhaustion';

  return { candles: age, state };
}

// ─── Impulse Legs ───

export interface ImpulseLeg {
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  size: number; // absolute price move
  direction: 'up' | 'down';
  candleCount: number;
}

export function getImpulseLegs(candles: Candle[], swings: SwingPoint[]): ImpulseLeg[] {
  const legs: ImpulseLeg[] = [];
  // Interleave highs and lows chronologically to get alternating swings
  const sorted = [...swings].sort((a, b) => a.index - b.index);

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    // Only count moves from low→high (up impulse) or high→low (down impulse)
    if (from.type === 'low' && to.type === 'high') {
      legs.push({
        startIndex: from.index,
        endIndex: to.index,
        startPrice: from.price,
        endPrice: to.price,
        size: to.price - from.price,
        direction: 'up',
        candleCount: to.index - from.index,
      });
    } else if (from.type === 'high' && to.type === 'low') {
      legs.push({
        startIndex: from.index,
        endIndex: to.index,
        startPrice: from.price,
        endPrice: to.price,
        size: from.price - to.price,
        direction: 'down',
        candleCount: to.index - from.index,
      });
    }
  }
  return legs;
}

function getPullbackAfterImpulse(candles: Candle[], swings: SwingPoint[], impulse: ImpulseLeg): number {
  // Find the retracement after this impulse
  const afterSwings = swings.filter(s => s.index > impulse.endIndex);
  if (afterSwings.length === 0) return 0;

  if (impulse.direction === 'up') {
    // Pullback = how far price dropped from impulse end
    const minAfter = Math.min(...afterSwings.filter(s => s.type === 'low').map(s => s.price));
    return isFinite(minAfter) ? impulse.endPrice - minAfter : 0;
  } else {
    const maxAfter = Math.max(...afterSwings.filter(s => s.type === 'high').map(s => s.price));
    return isFinite(maxAfter) ? maxAfter - impulse.endPrice : 0;
  }
}

// ─── Impulse Shrinkage Detection ───

export interface ImpulseAnalysis {
  legs: ImpulseLeg[];
  isShrinking: boolean; // each leg smaller than previous
  shrinkageRatio: number; // 0-1, higher = more shrinkage
  legCount: number;
}

export function analyzeImpulses(candles: Candle[], swings: SwingPoint[], trendDir: 'bullish' | 'bearish' | 'unknown'): ImpulseAnalysis {
  const allLegs = getImpulseLegs(candles, swings);
  // Filter to trend-direction impulses only
  const dir = trendDir === 'bullish' ? 'up' : trendDir === 'bearish' ? 'down' : null;
  const legs = dir ? allLegs.filter(l => l.direction === dir) : allLegs;

  if (legs.length < 2) {
    return { legs, isShrinking: false, shrinkageRatio: 0, legCount: legs.length };
  }

  const recentLegs = legs.slice(-5);
  let shrinkCount = 0;
  for (let i = 1; i < recentLegs.length; i++) {
    if (recentLegs[i].size < recentLegs[i - 1].size) shrinkCount++;
  }
  const shrinkageRatio = shrinkCount / (recentLegs.length - 1);

  return {
    legs: recentLegs,
    isShrinking: shrinkageRatio >= 0.6,
    shrinkageRatio,
    legCount: legs.length,
  };
}

// ─── Breakout Power ───

export type BreakoutType = 'strong' | 'weak' | 'fake';

export interface BreakoutResult {
  type: BreakoutType;
  score: number; // 0-100
  description: string;
}

export function analyzeBreakoutPower(candles: Candle[], swings: SwingPoint[]): BreakoutResult {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  const atr = calcATR(candles);

  if (highs.length < 2 || lows.length < 2 || atr === 0) {
    return { type: 'weak', score: 0, description: 'Insufficient data' };
  }

  // Check last BOS
  const lastCandle = candles[candles.length - 1];
  const prevHigh = highs[highs.length - 2];
  const prevLow = lows[lows.length - 2];

  // Find the most recent break
  let breakDistance = 0;
  let breakVolume = 0;
  let breakBody = 0;
  let isFake = false;
  let direction = '';

  // Check for bullish break
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    if (candles[i].close > prevHigh.price) {
      breakDistance = (candles[i].close - prevHigh.price) / atr;
      breakBody = Math.abs(candles[i].close - candles[i].open) / (candles[i].high - candles[i].low || 1);
      const avgVol = candles.slice(Math.max(0, i - 20), i).reduce((s, c) => s + c.volume, 0) / 20;
      breakVolume = avgVol > 0 ? candles[i].volume / avgVol : 1;
      // Check if it reversed
      if (i < candles.length - 1 && candles[candles.length - 1].close < prevHigh.price) {
        isFake = true;
      }
      direction = 'bullish';
      break;
    }
    if (candles[i].close < prevLow.price) {
      breakDistance = (prevLow.price - candles[i].close) / atr;
      breakBody = Math.abs(candles[i].close - candles[i].open) / (candles[i].high - candles[i].low || 1);
      const avgVol = candles.slice(Math.max(0, i - 20), i).reduce((s, c) => s + c.volume, 0) / 20;
      breakVolume = avgVol > 0 ? candles[i].volume / avgVol : 1;
      if (i < candles.length - 1 && candles[candles.length - 1].close > prevLow.price) {
        isFake = true;
      }
      direction = 'bearish';
      break;
    }
  }

  if (isFake) {
    return { type: 'fake', score: 10, description: `Fake ${direction} breakout — price reversed back` };
  }

  const score = Math.min(100, Math.round(breakDistance * 20 + breakBody * 30 + Math.min(breakVolume, 3) * 15));

  if (score >= 60) return { type: 'strong', score, description: `Strong ${direction} breakout — ${breakDistance.toFixed(1)} ATR, vol ${breakVolume.toFixed(1)}x` };
  return { type: 'weak', score, description: `Weak ${direction} breakout — ${breakDistance.toFixed(1)} ATR` };
}

// ─── Trend Leg Counter ───

export type TrendLegState = 'early' | 'strong' | 'mature' | 'exhaustion' | 'high_reversal';

export interface TrendLegResult {
  count: number;
  state: TrendLegState;
}

export function countTrendLegs(candles: Candle[], swings: SwingPoint[], trendDir: 'bullish' | 'bearish' | 'unknown'): TrendLegResult {
  const allLegs = getImpulseLegs(candles, swings);
  const dir = trendDir === 'bullish' ? 'up' : trendDir === 'bearish' ? 'down' : null;
  const legs = dir ? allLegs.filter(l => l.direction === dir) : allLegs;

  // Count legs in current trend (walk back until trend direction changes)
  let count = 0;
  for (let i = legs.length - 1; i >= 0; i--) {
    if (dir && legs[i].direction === dir) count++;
    else break;
  }

  let state: TrendLegState;
  if (count <= 1) state = 'early';
  else if (count === 2) state = 'strong';
  else if (count === 3) state = 'mature';
  else if (count === 4) state = 'exhaustion';
  else state = 'high_reversal';

  return { count, state };
}

// ─── Failure Speed ───

export interface FailureSpeedResult {
  failureCount: number;
  candleSpan: number;
  speed: 'fast' | 'slow' | 'none';
  description: string;
}

export function measureFailureSpeed(failures: number, trendAge: number): FailureSpeedResult {
  if (failures === 0) return { failureCount: 0, candleSpan: trendAge, speed: 'none', description: 'No failures' };

  const rate = trendAge > 0 ? failures / trendAge * 30 : 0; // failures per 30 candles
  const speed = rate >= 3 ? 'fast' : 'slow';
  const desc = speed === 'fast'
    ? `${failures} failures in ${trendAge} candles — trend instability`
    : `${failures} failures in ${trendAge} candles — normal pullbacks`;

  return { failureCount: failures, candleSpan: trendAge, speed, description: desc };
}

// ─── Momentum Decay ───

export interface MomentumDecayResult {
  current: number; // 0-100
  previous: number; // 0-100
  decaying: boolean;
  description: string;
}

export function detectMomentumDecay(candles: Candle[]): MomentumDecayResult {
  if (candles.length < 30) return { current: 50, previous: 50, decaying: false, description: 'Insufficient data' };

  const calcMom = (slice: Candle[]) => {
    const netMove = Math.abs(slice[slice.length - 1].close - slice[0].open);
    const totalRange = slice.reduce((s, c) => s + (c.high - c.low), 0);
    return totalRange > 0 ? Math.round((netMove / totalRange) * 100) : 0;
  };

  const recent = candles.slice(-10);
  const previous = candles.slice(-20, -10);

  const currentMom = calcMom(recent);
  const previousMom = calcMom(previous);
  const decaying = currentMom < previousMom * 0.7;

  return {
    current: currentMom,
    previous: previousMom,
    decaying,
    description: decaying ? 'Momentum weakening' : 'Momentum stable',
  };
}

// ─── Volatility Compression ───

export interface VolatilityCompressionResult {
  compressed: boolean;
  atrCurrent: number;
  atrPrevious: number;
  ratio: number;
  description: string;
}

export function detectVolatilityCompression(candles: Candle[]): VolatilityCompressionResult {
  if (candles.length < 40) return { compressed: false, atrCurrent: 0, atrPrevious: 0, ratio: 1, description: 'Insufficient data' };

  const calcAvgRange = (slice: Candle[]) => slice.reduce((s, c) => s + (c.high - c.low), 0) / slice.length;
  const recent = calcAvgRange(candles.slice(-10));
  const lookback = calcAvgRange(candles.slice(-30, -10));
  const ratio = lookback > 0 ? recent / lookback : 1;
  const compressed = ratio < 0.6;

  return {
    compressed,
    atrCurrent: recent,
    atrPrevious: lookback,
    ratio,
    description: compressed ? `Range compressed (${ratio.toFixed(2)}x) — breakout imminent` : 'Normal volatility',
  };
}

// ─── Distance to Structure ───

export interface StructureDistanceResult {
  distToHighPercent: number;
  distToLowPercent: number;
  nearStructure: boolean;
  description: string;
}

export function measureDistanceToStructure(candles: Candle[], swings: SwingPoint[]): StructureDistanceResult {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  const price = candles[candles.length - 1].close;

  const nearestHigh = highs.length > 0 ? Math.max(...highs.map(h => h.price)) : price;
  const nearestLow = lows.length > 0 ? Math.min(...lows.map(l => l.price)) : price;

  const distToHigh = price > 0 ? ((nearestHigh - price) / price) * 100 : 0;
  const distToLow = price > 0 ? ((price - nearestLow) / price) * 100 : 0;
  const nearStructure = Math.min(Math.abs(distToHigh), Math.abs(distToLow)) < 1;

  return {
    distToHighPercent: Math.round(distToHigh * 10) / 10,
    distToLowPercent: Math.round(distToLow * 10) / 10,
    nearStructure,
    description: nearStructure ? 'Near major structure — reversal zone' : 'Away from major structure',
  };
}
