const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MomentumSignal {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  timeframe: string;
  score: number;
  direction: 'bull' | 'bear';
  signals: {
    rsiBreakout: boolean;
    macdCross: boolean;
    volumeSpike: boolean;
    adxSurge: boolean;
    emaCrossover: boolean;
    priceAcceleration: boolean;
    stochMomentum: boolean;
    obvBreakout: boolean;
    squeezeFire: boolean;
    vwapBreak: boolean;
  };
  details: {
    rsi: number;
    macd: number;
    macdSignal: number;
    macdHist: number;
    adx: number;
    volumeRatio: number;
    roc: number;
    stochK: number;
    stochD: number;
    ema9: number;
    ema21: number;
    ema50: number;
    atr: number;
    bbSqueeze: number;
  };
  timestamp: number;
}

// ─── Indicator calculations ───

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function calcMACD(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, hist };
}

function calcADX(candles: Candle[], period = 14): number[] {
  const adx: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period * 2) return adx;
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { tr.push(candles[i].high - candles[i].low); plusDM.push(0); minusDM.push(0); continue; }
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const upMove = h - candles[i - 1].high;
    const downMove = candles[i - 1].low - l;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const smoothTR = ema(tr, period);
  const smoothPlusDM = ema(plusDM, period);
  const smoothMinusDM = ema(minusDM, period);
  const dx: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const pdi = smoothTR[i] ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
    const mdi = smoothTR[i] ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }
  const adxSmooth = ema(dx, period);
  for (let i = 0; i < candles.length; i++) {
    if (i >= period * 2) adx[i] = adxSmooth[i];
  }
  return adx;
}

function calcStochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: number[]; d: number[] } {
  const kArr: number[] = new Array(candles.length).fill(NaN);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    kArr[i] = range === 0 ? 50 : ((candles[i].close - ll) / range) * 100;
  }
  const dArr = sma(kArr.map(v => isNaN(v) ? 50 : v), dPeriod);
  return { k: kArr, d: dArr };
}

function calcATR(candles: Candle[], period = 14): number[] {
  const tr: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  return ema(tr, period);
}

function calcOBV(candles: Candle[]): number[] {
  const obv: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv.push(obv[i - 1] + candles[i].volume);
    else if (candles[i].close < candles[i - 1].close) obv.push(obv[i - 1] - candles[i].volume);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

function calcBBWidth(closes: number[], period = 20): number[] {
  const smaArr = sma(closes, period);
  const width: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (closes[j] - smaArr[i]) ** 2;
    }
    const std = Math.sqrt(variance / period);
    width[i] = smaArr[i] !== 0 ? (4 * std) / smaArr[i] : 0;
  }
  return width;
}

// ─── Core momentum detection ───

function detectMomentum(candles: Candle[], timeframe: string): Omit<MomentumSignal, 'symbol' | 'price' | 'change24h' | 'volume24h'> | null {
  if (candles.length < 60) return null;

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const len = closes.length;
  const last = len - 1;
  const prev = len - 2;
  const prev2 = len - 3;

  // Calculate all indicators
  const rsi = calcRSI(closes);
  const { macd, signal: macdSig, hist: macdHist } = calcMACD(closes);
  const adxArr = calcADX(candles);
  const { k: stochK, d: stochD } = calcStochastic(candles);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const atrArr = calcATR(candles);
  const obv = calcOBV(candles);
  const obvEma = ema(obv, 20);
  const bbWidth = calcBBWidth(closes);

  // Volume analysis - compare last 3 bars avg vs prior 20 bars avg
  const recentVolAvg = (volumes[last] + volumes[prev] + volumes[prev2]) / 3;
  const priorVolSlice = volumes.slice(Math.max(0, last - 23), last - 3);
  const priorVolAvg = priorVolSlice.length > 0 ? priorVolSlice.reduce((a, b) => a + b, 0) / priorVolSlice.length : 1;
  const volumeRatio = priorVolAvg > 0 ? recentVolAvg / priorVolAvg : 1;

  // Rate of change (5-bar)
  const roc5 = closes[last - 5] !== 0 ? ((closes[last] - closes[last - 5]) / closes[last - 5]) * 100 : 0;

  // Price acceleration: ROC of ROC
  const roc5prev = closes[last - 10] !== 0 ? ((closes[last - 5] - closes[last - 10]) / closes[last - 10]) * 100 : 0;
  const acceleration = roc5 - roc5prev;

  // VWAP approximation (session-based using last 20 bars)
  let vwapNum = 0, vwapDen = 0;
  for (let i = Math.max(0, last - 19); i <= last; i++) {
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    vwapNum += typical * candles[i].volume;
    vwapDen += candles[i].volume;
  }
  const vwap = vwapDen > 0 ? vwapNum / vwapDen : closes[last];

  // BB Squeeze: width at lowest in last 50 bars?
  const recentBBW = bbWidth.slice(Math.max(0, last - 50));
  const minBBW = Math.min(...recentBBW.filter(v => !isNaN(v)));
  const bbSqueezeRatio = !isNaN(bbWidth[last]) && minBBW > 0 ? bbWidth[last] / minBBW : 999;
  // Squeeze fire = was squeezed (within 20% of min) and now expanding
  const wasSqueezed = !isNaN(bbWidth[prev2]) && minBBW > 0 && bbWidth[prev2] / minBBW < 1.2;
  const isExpanding = !isNaN(bbWidth[last]) && !isNaN(bbWidth[prev]) && bbWidth[last] > bbWidth[prev] * 1.05;

  // Current values
  const curRSI = rsi[last] ?? 50;
  const curMACD = macd[last] ?? 0;
  const curMACDSig = macdSig[last] ?? 0;
  const curMACDHist = macdHist[last] ?? 0;
  const curADX = adxArr[last] ?? 0;
  const curStochK = stochK[last] ?? 50;
  const curStochD = stochD[last] ?? 50;
  const prevMACDHist = macdHist[prev] ?? 0;
  const prevRSI = rsi[prev] ?? 50;
  const curATR = atrArr[last] ?? 0;

  // Determine direction
  const isBullish = closes[last] > ema21[last] && ema9[last] > ema21[last];
  const isBearish = closes[last] < ema21[last] && ema9[last] < ema21[last];
  if (!isBullish && !isBearish) return null;
  const direction: 'bull' | 'bear' = isBullish ? 'bull' : 'bear';

  // ─── Signal detection (tuned for EARLY momentum) ───

  // 1. RSI Breakout: RSI crossing 50 from neutral zone (momentum initiation)
  const rsiBreakout = direction === 'bull'
    ? (prevRSI < 55 && curRSI > 50 && curRSI < 75)
    : (prevRSI > 45 && curRSI < 50 && curRSI > 25);

  // 2. MACD Cross: histogram flipping or accelerating
  const macdCross = direction === 'bull'
    ? (prevMACDHist <= 0 && curMACDHist > 0) || (curMACDHist > prevMACDHist && curMACDHist > 0)
    : (prevMACDHist >= 0 && curMACDHist < 0) || (curMACDHist < prevMACDHist && curMACDHist < 0);

  // 3. Volume spike: at least 1.8x average
  const volumeSpike = volumeRatio >= 1.8;

  // 4. ADX surge: rising and above 20 (trend starting)
  const prevADX = adxArr[prev] ?? 0;
  const adxSurge = curADX > 20 && curADX > prevADX && (curADX - prevADX) > 1;

  // 5. EMA crossover: fast crossing slow recently
  const emaCrossover = direction === 'bull'
    ? (ema9[prev] <= ema21[prev] && ema9[last] > ema21[last]) || (ema9[last] > ema21[last] && ema21[last] > ema50[last])
    : (ema9[prev] >= ema21[prev] && ema9[last] < ema21[last]) || (ema9[last] < ema21[last] && ema21[last] < ema50[last]);

  // 6. Price acceleration
  const priceAcceleration = direction === 'bull' ? acceleration > 0.1 : acceleration < -0.1;

  // 7. Stochastic momentum: K crossing D in momentum zone
  const prevStochK = stochK[prev] ?? 50;
  const prevStochD = stochD[prev] ?? 50;
  const stochMomentum = direction === 'bull'
    ? (prevStochK <= prevStochD && curStochK > curStochD && curStochK < 80)
    : (prevStochK >= prevStochD && curStochK < curStochD && curStochK > 20);

  // 8. OBV breakout: OBV crossing its EMA
  const obvBreakout = direction === 'bull'
    ? obv[last] > obvEma[last] && obv[prev] <= obvEma[prev]
    : obv[last] < obvEma[last] && obv[prev] >= obvEma[prev];

  // 9. Squeeze fire: BB was compressed, now expanding with directional move
  const squeezeFire = wasSqueezed && isExpanding && (
    direction === 'bull' ? roc5 > 0 : roc5 < 0
  );

  // 10. VWAP break: price crossing VWAP
  const vwapBreak = direction === 'bull'
    ? closes[last] > vwap && closes[prev] <= vwap
    : closes[last] < vwap && closes[prev] >= vwap;

  const signals = {
    rsiBreakout,
    macdCross,
    volumeSpike,
    adxSurge,
    emaCrossover,
    priceAcceleration,
    stochMomentum,
    obvBreakout,
    squeezeFire,
    vwapBreak,
  };

  // Weighted scoring
  const weights = {
    rsiBreakout: 10,
    macdCross: 15,
    volumeSpike: 20,
    adxSurge: 15,
    emaCrossover: 12,
    priceAcceleration: 8,
    stochMomentum: 8,
    obvBreakout: 7,
    squeezeFire: 12,
    vwapBreak: 8,
  };

  let score = 0;
  for (const [key, val] of Object.entries(signals)) {
    if (val) score += weights[key as keyof typeof weights];
  }

  // Bonus for confluence
  const signalCount = Object.values(signals).filter(Boolean).length;
  if (signalCount >= 5) score += 10;
  if (signalCount >= 7) score += 15;

  // Filter: need at least 3 signals and score >= 30
  if (signalCount < 3 || score < 30) return null;

  // Must have at least one of the "core" signals
  if (!macdCross && !volumeSpike && !adxSurge && !squeezeFire) return null;

  return {
    timeframe,
    score,
    direction,
    signals,
    details: {
      rsi: Math.round(curRSI * 100) / 100,
      macd: Math.round(curMACD * 1e8) / 1e8,
      macdSignal: Math.round(curMACDSig * 1e8) / 1e8,
      macdHist: Math.round(curMACDHist * 1e8) / 1e8,
      adx: Math.round(curADX * 100) / 100,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      roc: Math.round(roc5 * 100) / 100,
      stochK: Math.round(curStochK * 100) / 100,
      stochD: Math.round(curStochD * 100) / 100,
      ema9: ema9[last],
      ema21: ema21[last],
      ema50: ema50[last],
      atr: curATR,
      bbSqueeze: Math.round(bbSqueezeRatio * 100) / 100,
    },
    timestamp: Date.now(),
  };
}

// ─── Bybit API helpers ───

async function fetchTickers(): Promise<Array<{ symbol: string; lastPrice: number; price24hPcnt: number; volume24h: number; turnover24h: number }>> {
  const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
  const data = await res.json();
  if (data.retCode !== 0) return [];
  return data.result.list
    .filter((t: any) => t.symbol.endsWith('USDT'))
    .map((t: any) => ({
      symbol: t.symbol,
      lastPrice: parseFloat(t.lastPrice),
      price24hPcnt: parseFloat(t.price24hPcnt) * 100,
      volume24h: parseFloat(t.volume24h),
      turnover24h: parseFloat(t.turnover24h),
    }))
    .filter((t: any) => t.turnover24h > 5_000_000) // Only coins with >$5M daily turnover
    .sort((a: any, b: any) => b.turnover24h - a.turnover24h)
    .slice(0, 100); // Top 100 by turnover
}

async function fetchKlines(symbol: string, interval: string, limit = 100): Promise<Candle[]> {
  const res = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`);
  const data = await res.json();
  if (data.retCode !== 0 || !data.result?.list) return [];
  return data.result.list
    .map((k: string[]) => ({
      time: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .reverse();
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tickers = await fetchTickers();
    const timeframes = ['15', '60', '240', 'D'];
    const allSignals: MomentumSignal[] = [];

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const batchPromises = batch.flatMap(ticker =>
        timeframes.map(async (tf) => {
          try {
            const candles = await fetchKlines(ticker.symbol, tf, 100);
            const result = detectMomentum(candles, tf);
            if (result) {
              allSignals.push({
                ...result,
                symbol: ticker.symbol,
                price: ticker.lastPrice,
                change24h: ticker.price24hPcnt,
                volume24h: ticker.turnover24h,
              });
            }
          } catch {
            // skip
          }
        })
      );
      await Promise.all(batchPromises);
      // Small delay between batches
      if (i + batchSize < tickers.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Sort by score descending
    allSignals.sort((a, b) => b.score - a.score);

    return new Response(JSON.stringify({
      signals: allSignals,
      scannedAt: new Date().toISOString(),
      totalScanned: tickers.length,
      totalTimeframes: timeframes.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
