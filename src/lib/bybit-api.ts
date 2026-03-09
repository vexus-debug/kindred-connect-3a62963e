import type { BybitTickerResponse, BybitKlineResponse, Candle, Timeframe } from '@/types/scanner';

const DIRECT_URL = 'https://api.bybit.com';

// CORS proxies to try
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

let skipDirect = false; // After first CORS failure, skip direct attempts

async function fetchJson<T>(path: string): Promise<T> {
  const fullUrl = `${DIRECT_URL}${path}`;

  // Try direct first (only once globally)
  if (!skipDirect) {
    try {
      const res = await fetch(fullUrl);
      if (!res.ok) throw new Error(`Bybit API error: ${res.status}`);
      return await res.json();
    } catch {
      skipDirect = true;
    }
  }

  // Try each proxy for this specific request
  const errors: string[] = [];
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    try {
      const proxyUrl = CORS_PROXIES[i](fullUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Proxy ${i} HTTP ${res.status}`);
      const text = await res.text();
      // Validate it's JSON before parsing
      if (text.startsWith('<')) throw new Error(`Proxy ${i} returned HTML`);
      return JSON.parse(text) as T;
    } catch (err: any) {
      errors.push(`Proxy ${i}: ${err.message}`);
      continue;
    }
  }

  throw new Error(`All proxies failed for ${path}: ${errors.join('; ')}`);
}

export async function fetchTickers(category: 'spot' | 'linear'): Promise<BybitTickerResponse> {
  return fetchJson(`/v5/market/tickers?category=${category}`);
}

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  category: 'spot' | 'linear',
  limit: number = 220
): Promise<Candle[]> {
  const data = await fetchJson<BybitKlineResponse>(
    `/v5/market/kline?category=${category}&symbol=${symbol}&interval=${interval}&limit=${limit}`
  );

  if (data.retCode !== 0 || !data.result?.list) return [];

  return data.result.list
    .map((k) => ({
      time: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .reverse();
}

export async function fetchKlinesBatch(
  symbols: string[],
  interval: Timeframe,
  category: 'spot' | 'linear',
  batchSize: number = 5,
  delayMs: number = 200
): Promise<Map<string, Candle[]>> {
  const results = new Map<string, Candle[]>();

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async (symbol) => {
      try {
        const candles = await fetchKlines(symbol, interval, category);
        results.set(symbol, candles);
      } catch {
        // Skip failed symbols
      }
    });
    await Promise.all(promises);
    if (i + batchSize < symbols.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
