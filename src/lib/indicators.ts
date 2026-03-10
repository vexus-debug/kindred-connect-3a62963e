import type { Candle, TrendSignal, TrendDirection, TrendStrength } from '@/types/scanner';

export function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return ema;
  const k = 2 / (period + 1);
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calculateTR(candles: Candle[]): number[] {
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  return tr;
}

function smoothedAvg(data: number[], period: number): number[] {
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      sum += data[i];
      result.push(sum / (i + 1));
    } else {
      result.push((result[i - 1] * (period - 1) + data[i]) / period);
    }
  }
  return result;
}

export function calculateADX(candles: Candle[], period: number = 14): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length < period + 1) return { adx: 0, plusDI: 0, minusDI: 0 };

  const plusDM: number[] = [0];
  const minusDM: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const tr = calculateTR(candles);
  const smoothTR = smoothedAvg(tr, period);
  const smoothPlusDM = smoothedAvg(plusDM, period);
  const smoothMinusDM = smoothedAvg(minusDM, period);

  const dx: number[] = [];
  let lastPlusDI = 0, lastMinusDI = 0;
  for (let i = 0; i < smoothTR.length; i++) {
    if (smoothTR[i] === 0) { dx.push(0); continue; }
    lastPlusDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
    lastMinusDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const diSum = lastPlusDI + lastMinusDI;
    dx.push(diSum === 0 ? 0 : (Math.abs(lastPlusDI - lastMinusDI) / diSum) * 100);
  }

  const adx = smoothedAvg(dx, period);
  return { adx: adx[adx.length - 1] || 0, plusDI: lastPlusDI, minusDI: lastMinusDI };
}

export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateMACD(closes: number[], fast = 12, slow = 26, signal = 9): { macd: number; signal: number; histogram: number } {
  if (closes.length < slow + signal) return { macd: 0, signal: 0, histogram: 0 };
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = calculateEMA(macdLine.slice(slow - 1), signal);
  const macdVal = macdLine[macdLine.length - 1];
  const signalVal = signalLine[signalLine.length - 1];
  return { macd: macdVal, signal: signalVal, histogram: macdVal - signalVal };
}

export function calculateVolumeRatio(candles: Candle[], lookback: number = 20): number {
  if (candles.length < 2) return 1;
  const recent = candles[candles.length - 1].volume;
  const slice = candles.slice(-Math.min(lookback + 1, candles.length), -1);
  if (slice.length === 0) return 1;
  const avg = slice.reduce((s, c) => s + c.volume, 0) / slice.length;
  return avg === 0 ? 1 : recent / avg;
}

/** Find nearest support and resistance from swing highs/lows and EMAs */
function findSupportResistance(candles: Candle[], emas: { e9: number; e21: number; e50: number; e200: number }): SupportResistance {
  const price = candles[candles.length - 1].close;
  const lookback = Math.min(candles.length, 100);
  const recent = candles.slice(-lookback);

  // Collect swing highs and lows
  const levels: number[] = [];
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
        recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
      levels.push(recent[i].high);
    }
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
        recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
      levels.push(recent[i].low);
    }
  }

  // Add EMA levels as dynamic S/R
  levels.push(emas.e9, emas.e21, emas.e50, emas.e200);

  const supports = levels.filter(l => l < price).sort((a, b) => b - a);
  const resistances = levels.filter(l => l > price).sort((a, b) => a - b);

  const nearestSupport = supports[0] ?? price * 0.95;
  const nearestResistance = resistances[0] ?? price * 1.05;

  return {
    nearestSupport,
    nearestResistance,
    supportDistance: ((price - nearestSupport) / price) * 100,
    resistanceDistance: ((nearestResistance - price) / price) * 100,
  };
}

/** Calculate trend probability (0-100) based on weighted indicator confluence */
function calculateProbability(
  bullVotes: number, bearVotes: number, totalChecks: number,
  adx: number, volumeRatio: number, rsi: number, direction: 'bull' | 'bear'
): number {
  // Base: confirmation ratio
  const maxVotes = Math.max(bullVotes, bearVotes);
  let prob = (maxVotes / totalChecks) * 60; // up to 60%

  // ADX strength bonus (up to 15%)
  prob += Math.min(adx / 60, 1) * 15;

  // Volume confirmation bonus (up to 10%)
  if (volumeRatio > 1.3) prob += Math.min((volumeRatio - 1) / 2, 1) * 10;

  // RSI alignment bonus (up to 10%)
  if (direction === 'bull' && rsi > 55 && rsi < 80) prob += 10;
  else if (direction === 'bear' && rsi < 45 && rsi > 20) prob += 10;
  else if (rsi >= 80 || rsi <= 20) prob -= 5; // overbought/oversold = less reliable

  // Opposing votes penalty
  const opposingRatio = Math.min(bullVotes, bearVotes) / totalChecks;
  prob -= opposingRatio * 15;

  return Math.max(10, Math.min(95, Math.round(prob)));
}

/** Check for higher highs & higher lows (bull) or lower highs & lower lows (bear) */
function analyzePriceStructure(candles: Candle[], lookback = 20): 'bull' | 'bear' | 'neutral' {
  const recent = candles.slice(-lookback);
  if (recent.length < 6) return 'neutral';
  
  // Find swing highs and lows (simple method: local extremes)
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
        recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
      swingHighs.push(recent[i].high);
    }
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
        recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
      swingLows.push(recent[i].low);
    }
  }
  
  if (swingHighs.length < 2 || swingLows.length < 2) return 'neutral';
  
  const hhCount = swingHighs.slice(1).filter((h, i) => h > swingHighs[i]).length;
  const hlCount = swingLows.slice(1).filter((l, i) => l > swingLows[i]).length;
  const lhCount = swingHighs.slice(1).filter((h, i) => h < swingHighs[i]).length;
  const llCount = swingLows.slice(1).filter((l, i) => l < swingLows[i]).length;
  
  const bullStructure = hhCount + hlCount;
  const bearStructure = lhCount + llCount;
  
  if (bullStructure >= 2 && bullStructure > bearStructure) return 'bull';
  if (bearStructure >= 2 && bearStructure > bullStructure) return 'bear';
  return 'neutral';
}

export interface IndicatorDetail {
  name: string;
  signal: 'bull' | 'bear' | 'neutral';
  value: string;
  confirmed: boolean;
}

export interface SupportResistance {
  nearestSupport: number;
  nearestResistance: number;
  supportDistance: number; // % distance from price
  resistanceDistance: number; // % distance from price
}

export interface ConfirmedTrend extends TrendSignal {
  confirmations: number;
  totalChecks: number;
  indicators: IndicatorDetail[];
  rsi: number;
  macdHistogram: number;
  priceStructure: 'bull' | 'bear' | 'neutral';
  plusDI: number;
  minusDI: number;
  probability: number; // 0-100%
  supportResistance: SupportResistance;
}

export function analyzeTrend(
  candles: Candle[],
  emaPeriods = { fast: 9, slow: 21, mid: 50, long: 200 },
  adxThreshold = 25
): ConfirmedTrend | null {
  if (candles.length < emaPeriods.long + 10) return null;

  const closes = candles.map(c => c.close);
  const ema9 = calculateEMA(closes, emaPeriods.fast);
  const ema21 = calculateEMA(closes, emaPeriods.slow);
  const ema50 = calculateEMA(closes, emaPeriods.mid);
  const ema200 = calculateEMA(closes, emaPeriods.long);

  const lastIdx = closes.length - 1;
  const e9 = ema9[lastIdx];
  const e21 = ema21[lastIdx];
  const e50 = ema50[lastIdx];
  const e200 = ema200[lastIdx];
  const price = closes[lastIdx];

  const { adx, plusDI, minusDI } = calculateADX(candles);
  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  const volumeRatio = calculateVolumeRatio(candles);
  const priceStructure = analyzePriceStructure(candles);

  // --- Build indicator checks ---
  const indicators: IndicatorDetail[] = [];
  let bullVotes = 0, bearVotes = 0;
  const totalChecks = 7;

  // 1. EMA Ribbon alignment (fast > slow > mid > long = strong bull)
  const emaAligned = e9 > e21 && e21 > e50 && e50 > e200;
  const emaBearAligned = e9 < e21 && e21 < e50 && e50 < e200;
  const emaPartialBull = e9 > e21 && price > e50;
  const emaPartialBear = e9 < e21 && price < e50;
  
  if (emaAligned) { bullVotes += 1; indicators.push({ name: 'EMA Ribbon', signal: 'bull', value: 'Fully aligned ↑', confirmed: true }); }
  else if (emaBearAligned) { bearVotes += 1; indicators.push({ name: 'EMA Ribbon', signal: 'bear', value: 'Fully aligned ↓', confirmed: true }); }
  else if (emaPartialBull) { bullVotes += 0.5; indicators.push({ name: 'EMA Ribbon', signal: 'bull', value: 'Partial align ↑', confirmed: false }); }
  else if (emaPartialBear) { bearVotes += 0.5; indicators.push({ name: 'EMA Ribbon', signal: 'bear', value: 'Partial align ↓', confirmed: false }); }
  else { indicators.push({ name: 'EMA Ribbon', signal: 'neutral', value: 'Mixed', confirmed: false }); }

  // 2. ADX trend strength + DI direction
  if (adx >= adxThreshold) {
    if (plusDI > minusDI) { bullVotes += 1; indicators.push({ name: 'ADX/DI', signal: 'bull', value: `ADX ${adx.toFixed(0)} +DI>${'-'}DI`, confirmed: true }); }
    else { bearVotes += 1; indicators.push({ name: 'ADX/DI', signal: 'bear', value: `ADX ${adx.toFixed(0)} ${'-'}DI>+DI`, confirmed: true }); }
  } else {
    indicators.push({ name: 'ADX/DI', signal: 'neutral', value: `ADX ${adx.toFixed(0)} (weak)`, confirmed: false });
  }

  // 3. RSI momentum
  if (rsi > 55 && rsi < 80) { bullVotes += 1; indicators.push({ name: 'RSI', signal: 'bull', value: `${rsi.toFixed(0)} (bullish momentum)`, confirmed: true }); }
  else if (rsi < 45 && rsi > 20) { bearVotes += 1; indicators.push({ name: 'RSI', signal: 'bear', value: `${rsi.toFixed(0)} (bearish momentum)`, confirmed: true }); }
  else if (rsi >= 80) { indicators.push({ name: 'RSI', signal: 'neutral', value: `${rsi.toFixed(0)} (overbought)`, confirmed: false }); }
  else if (rsi <= 20) { indicators.push({ name: 'RSI', signal: 'neutral', value: `${rsi.toFixed(0)} (oversold)`, confirmed: false }); }
  else { indicators.push({ name: 'RSI', signal: 'neutral', value: `${rsi.toFixed(0)} (neutral)`, confirmed: false }); }

  // 4. MACD
  if (macd.histogram > 0 && macd.macd > 0) { bullVotes += 1; indicators.push({ name: 'MACD', signal: 'bull', value: `Histogram +${macd.histogram.toPrecision(3)}`, confirmed: true }); }
  else if (macd.histogram < 0 && macd.macd < 0) { bearVotes += 1; indicators.push({ name: 'MACD', signal: 'bear', value: `Histogram ${macd.histogram.toPrecision(3)}`, confirmed: true }); }
  else { indicators.push({ name: 'MACD', signal: 'neutral', value: 'Diverging', confirmed: false }); }

  // 5. Volume confirmation
  if (volumeRatio > 1.3) {
    const dir = bullVotes > bearVotes ? 'bull' : bearVotes > bullVotes ? 'bear' : 'neutral';
    if (dir !== 'neutral') {
      if (dir === 'bull') bullVotes += 1; else bearVotes += 1;
      indicators.push({ name: 'Volume', signal: dir, value: `${volumeRatio.toFixed(1)}x avg`, confirmed: true });
    } else {
      indicators.push({ name: 'Volume', signal: 'neutral', value: `${volumeRatio.toFixed(1)}x avg`, confirmed: false });
    }
  } else {
    indicators.push({ name: 'Volume', signal: 'neutral', value: `${volumeRatio.toFixed(1)}x avg (low)`, confirmed: false });
  }

  // 6. Price structure (HH/HL or LH/LL)
  if (priceStructure === 'bull') { bullVotes += 1; indicators.push({ name: 'Structure', signal: 'bull', value: 'HH + HL pattern', confirmed: true }); }
  else if (priceStructure === 'bear') { bearVotes += 1; indicators.push({ name: 'Structure', signal: 'bear', value: 'LH + LL pattern', confirmed: true }); }
  else { indicators.push({ name: 'Structure', signal: 'neutral', value: 'No clear pattern', confirmed: false }); }

  // 7. Price vs 200 EMA (long-term bias)
  const pctFrom200 = ((price - e200) / e200) * 100;
  if (price > e200) { bullVotes += 1; indicators.push({ name: '200 EMA', signal: 'bull', value: `+${pctFrom200.toFixed(1)}% above`, confirmed: true }); }
  else { bearVotes += 1; indicators.push({ name: '200 EMA', signal: 'bear', value: `${pctFrom200.toFixed(1)}% below`, confirmed: true }); }

  // --- Determine confirmed trend ---
  const maxVotes = Math.max(bullVotes, bearVotes);
  const confirmations = Math.round(maxVotes);
  
  // Need at least 4/7 indicators agreeing for a confirmed trend
  if (confirmations < 4) return null;

  const direction: TrendDirection = bullVotes > bearVotes ? 'bull' : 'bear';
  
  let strength: TrendStrength = 'weak';
  if (confirmations >= 6) strength = 'strong';
  else if (confirmations >= 5) strength = 'moderate';

  const score = direction === 'bull' ? Math.round(bullVotes * 15) : -Math.round(bearVotes * 15);

  const probability = calculateProbability(bullVotes, bearVotes, totalChecks, adx, volumeRatio, rsi, direction);
  const supportResistance = findSupportResistance(candles, { e9, e21, e50, e200 });

  return {
    direction, strength,
    ema9: e9, ema21: e21, ema50: e50, ema200: e200,
    adx, volumeRatio, score,
    confirmations, totalChecks,
    indicators,
    rsi, macdHistogram: macd.histogram,
    priceStructure, plusDI, minusDI,
    probability, supportResistance,
  };
}
