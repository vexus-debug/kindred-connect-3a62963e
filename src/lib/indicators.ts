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

export function calculateADX(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;

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
  for (let i = 0; i < smoothTR.length; i++) {
    if (smoothTR[i] === 0) { dx.push(0); continue; }
    const plusDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const minusDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const diSum = plusDI + minusDI;
    dx.push(diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100);
  }

  const adx = smoothedAvg(dx, period);
  return adx[adx.length - 1] || 0;
}

export function calculateVolumeRatio(candles: Candle[], lookback: number = 20): number {
  if (candles.length < 2) return 1;
  const recent = candles[candles.length - 1].volume;
  const slice = candles.slice(-Math.min(lookback + 1, candles.length), -1);
  if (slice.length === 0) return 1;
  const avg = slice.reduce((s, c) => s + c.volume, 0) / slice.length;
  return avg === 0 ? 1 : recent / avg;
}

export function analyzeTrend(
  candles: Candle[],
  emaPeriods = { fast: 9, slow: 21, mid: 50, long: 200 },
  adxThreshold = 25
): TrendSignal | null {
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
  const adx = calculateADX(candles);
  const volumeRatio = calculateVolumeRatio(candles);

  let score = 0;

  if (e9 > e21) score += 30;
  else if (e9 < e21) score -= 30;

  if (price > e50) score += 20;
  else if (price < e50) score -= 20;

  if (price > e200) score += 20;
  else if (price < e200) score -= 20;

  if (adx > adxThreshold) {
    score += score > 0 ? 15 : -15;
  }

  if (volumeRatio > 1.5) {
    score += score > 0 ? 15 : -15;
  }

  const absScore = Math.abs(score);
  if (absScore < 20) return null;

  const direction: TrendDirection = score > 0 ? 'bull' : 'bear';
  let strength: TrendStrength = 'weak';
  if (absScore >= 70) strength = 'strong';
  else if (absScore >= 45) strength = 'moderate';

  return { direction, strength, ema9: e9, ema21: e21, ema50: e50, ema200: e200, adx, volumeRatio, score };
}
