
-- Table to cache server-side scan results
CREATE TABLE public.scan_cache (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

-- Allow public read access (market data, no user-specific info)
CREATE POLICY "Anyone can read scan cache"
  ON public.scan_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service role can write (edge function uses service role key)
-- RLS is enabled by default via the trigger, so no INSERT/UPDATE policy for anon

-- Seed initial rows so upserts work
INSERT INTO public.scan_cache (id, data, scanned_at) VALUES
  ('trends', '[]'::jsonb, now()),
  ('candlestick', '[]'::jsonb, now()),
  ('chart', '[]'::jsonb, now()),
  ('structure', '[]'::jsonb, now()),
  ('alerts', '[]'::jsonb, now()),
  ('metadata', '{}'::jsonb, now());
