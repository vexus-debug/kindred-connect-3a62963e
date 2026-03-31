import type { Candle } from '@/types/scanner';
import type { SwingPoint, LiquidityPool } from './types';
import { findSwings, findClusteredSwings } from './swings';
import { calcATR } from './volatility-filter';
import {
  measureTrendStrength,
  measureTrendAge,
  analyzeImpulses,
  analyzeBreakoutPower,
  countTrendLegs,
  measureFailureSpeed,
  detectMomentumDecay,
  detectVolatilityCompression,
  measureDistanceToStructure,
  type TrendStrengthResult,
  type TrendAgeResult,
  type ImpulseAnalysis,
  type BreakoutResult,
  type TrendLegResult,
  type FailureSpeedResult,
  type MomentumDecayResult,
  type VolatilityCompressionResult,
  type StructureDistanceResult,
} from './trend-analysis';

export interface LiquiditySweepResult {
  count: number;
  sweeps: Array<{ type: 'equal_high' | 'equal_low' | 'swing_high' | 'swing_low'; price: number; index: number }>;
}

export function countLiquiditySweeps(candles: Candle[], swings: SwingPoint[]): LiquiditySweepResult {
  const sweeps: LiquiditySweepResult['sweeps'] = [];
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  // Check equal highs/lows (clustered swings)
  const highClusters = findClusteredSwings(highs, 0.003);
  const lowClusters = findClusteredSwings(lows, 0.003);

  const recentStart = Math.max(0, candles.length - 20);

  // Check sweeps of equal highs
  for (const cluster of highClusters) {
    const level = Math.max(...cluster.map(c => c.price));
    for (let i = recentStart; i < candles.length; i++) {
      if (candles[i].high > level && candles[i].close < level) {
        sweeps.push({ type: 'equal_high', price: level, index: i });
        break;
      }
    }
  }

  // Check sweeps of equal lows
  for (const cluster of lowClusters) {
    const level = Math.min(...cluster.map(c => c.price));
    for (let i = recentStart; i < candles.length; i++) {
      if (candles[i].low < level && candles[i].close > level) {
        sweeps.push({ type: 'equal_low', price: level, index: i });
        break;
      }
    }
  }

  // Check sweeps of individual swing highs/lows
  for (const h of highs.slice(-5)) {
    for (let i = h.index + 3; i < candles.length && i < h.index + 15; i++) {
      if (candles[i].high > h.price && candles[i].close < h.price) {
        sweeps.push({ type: 'swing_high', price: h.price, index: i });
        break;
      }
    }
  }
  for (const l of lows.slice(-5)) {
    for (let i = l.index + 3; i < candles.length && i < l.index + 15; i++) {
      if (candles[i].low < l.price && candles[i].close > l.price) {
        sweeps.push({ type: 'swing_low', price: l.price, index: i });
        break;
      }
    }
  }

  return { count: sweeps.length, sweeps };
}

// ─── Reversal Probability Score ───

export interface ReversalScore {
  score: number; // 0-10
  label: 'healthy' | 'weakening' | 'exhaustion' | 'high_reversal';
  factors: string[];
}

export function calcReversalScore(
  chochFailures: number,
  trendAge: TrendAgeResult,
  impulseAnalysis: ImpulseAnalysis,
  liquiditySweeps: LiquiditySweepResult,
  momentumDecay: MomentumDecayResult,
  breakout: BreakoutResult,
  trendLegs: TrendLegResult,
  volCompression: VolatilityCompressionResult,
): ReversalScore {
  let score = 0;
  const factors: string[] = [];

  // CHoCH failures (max 3 points)
  if (chochFailures >= 5) { score += 3; factors.push(`${chochFailures} CHoCH failures`); }
  else if (chochFailures >= 3) { score += 2; factors.push(`${chochFailures} CHoCH failures`); }
  else if (chochFailures >= 1) { score += 1; factors.push(`${chochFailures} CHoCH failure(s)`); }

  // Trend age (max 2 points)
  if (trendAge.state === 'exhaustion') { score += 2; factors.push(`Trend age: ${trendAge.candles} candles (exhaustion)`); }
  else if (trendAge.state === 'aging') { score += 1; factors.push(`Trend age: ${trendAge.candles} candles (aging)`); }

  // Impulse shrinkage (max 1.5 points)
  if (impulseAnalysis.isShrinking) { score += 1.5; factors.push('Impulses shrinking'); }

  // Liquidity sweeps (max 1.5 points)
  if (liquiditySweeps.count >= 3) { score += 1.5; factors.push(`${liquiditySweeps.count} liquidity sweeps`); }
  else if (liquiditySweeps.count >= 1) { score += 0.5; factors.push(`${liquiditySweeps.count} liquidity sweep(s)`); }

  // Momentum decay (max 1 point)
  if (momentumDecay.decaying) { score += 1; factors.push('Momentum decaying'); }

  // Fake/weak breakout (max 0.5 points)
  if (breakout.type === 'fake') { score += 0.5; factors.push('Fake breakout'); }

  // Trend legs (max 0.5 points)
  if (trendLegs.count >= 5) { score += 0.5; factors.push(`${trendLegs.count} trend legs`); }

  score = Math.min(10, Math.round(score * 10) / 10);

  let label: ReversalScore['label'];
  if (score <= 3) label = 'healthy';
  else if (score <= 6) label = 'weakening';
  else if (score <= 8) label = 'exhaustion';
  else label = 'high_reversal';

  return { score, label, factors };
}

// ─── Market Exhaustion Index ───

export interface ExhaustionIndex {
  value: number; // 0-100
  description: string;
}

export function calcExhaustionIndex(
  reversalScore: ReversalScore,
  trendStrength: TrendStrengthResult,
  volCompression: VolatilityCompressionResult,
  structDist: StructureDistanceResult,
): ExhaustionIndex {
  // Invert trend strength (weaker trend = more exhaustion)
  const strengthExhaustion = 100 - trendStrength.score;

  // Reversal score contribution (0-10 → 0-100)
  const reversalContrib = reversalScore.score * 10;

  // Compression bonus
  const compressionBonus = volCompression.compressed ? 10 : 0;

  // Near structure bonus
  const structBonus = structDist.nearStructure ? 10 : 0;

  const raw = strengthExhaustion * 0.3 + reversalContrib * 0.5 + compressionBonus + structBonus;
  const value = Math.round(Math.min(100, Math.max(0, raw)));

  let desc = 'Low exhaustion';
  if (value >= 80) desc = 'Extreme exhaustion — reversal imminent';
  else if (value >= 60) desc = 'High exhaustion — watch for reversal';
  else if (value >= 40) desc = 'Moderate exhaustion';

  return { value, description: desc };
}

// ─── Full Exhaustion Analysis ───

export interface FullExhaustionAnalysis {
  trendDirection: 'bullish' | 'bearish' | 'unknown';
  trendStrength: TrendStrengthResult;
  trendAge: TrendAgeResult;
  impulseAnalysis: ImpulseAnalysis;
  breakout: BreakoutResult;
  trendLegs: TrendLegResult;
  liquiditySweeps: LiquiditySweepResult;
  failureSpeed: FailureSpeedResult;
  momentumDecay: MomentumDecayResult;
  volatilityCompression: VolatilityCompressionResult;
  structureDistance: StructureDistanceResult;
  reversalScore: ReversalScore;
  exhaustionIndex: ExhaustionIndex;
  chochFailures: number;
}

export function analyzeExhaustion(candles: Candle[], chochFailures: number): FullExhaustionAnalysis {
  const swings = findSwings(candles, 3);
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  // Determine trend direction
  let trendDirection: 'bullish' | 'bearish' | 'unknown' = 'unknown';
  if (highs.length >= 2 && lows.length >= 2) {
    const lastHH = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const lastHL = lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lastLH = highs[highs.length - 1].price < highs[highs.length - 2].price;
    const lastLL = lows[lows.length - 1].price < lows[lows.length - 2].price;
    if (lastHH && lastHL) trendDirection = 'bullish';
    else if (lastLH && lastLL) trendDirection = 'bearish';
  }

  const trendStrength = measureTrendStrength(candles, swings);
  const trendAge = measureTrendAge(candles, swings);
  const impulseAnalysis = analyzeImpulses(candles, swings, trendDirection);
  const breakout = analyzeBreakoutPower(candles, swings);
  const trendLegs = countTrendLegs(candles, swings, trendDirection);
  const liquiditySweeps = countLiquiditySweeps(candles, swings);
  const failureSpeed = measureFailureSpeed(chochFailures, trendAge.candles);
  const momentumDecay = detectMomentumDecay(candles);
  const volatilityCompression = detectVolatilityCompression(candles);
  const structureDistance = measureDistanceToStructure(candles, swings);

  const reversalScore = calcReversalScore(
    chochFailures, trendAge, impulseAnalysis, liquiditySweeps,
    momentumDecay, breakout, trendLegs, volatilityCompression,
  );

  const exhaustionIndex = calcExhaustionIndex(
    reversalScore, trendStrength, volatilityCompression, structureDistance,
  );

  return {
    trendDirection,
    trendStrength,
    trendAge,
    impulseAnalysis,
    breakout,
    trendLegs,
    liquiditySweeps,
    failureSpeed,
    momentumDecay,
    volatilityCompression,
    structureDistance,
    reversalScore,
    exhaustionIndex,
    chochFailures,
  };
}
