-- Restore only TikTok with the tested TikTokio scraper. Other beta routes stay removed.
INSERT INTO public.endpoints (name, category, method, path, description, min_plan, status, params)
VALUES (
  'TikTok Downloader (TikTokio)', 'Downloader', 'GET', '/api/download/tiktok',
  'Unduh video TikTok dengan atau tanpa watermark, HD, dan MP3 melalui TikTokio.',
  'free', 'active',
  '[{"name":"url","type":"string","required":true,"default":"https://vt.tiktok.com/ZS9ChQ9WD/"}]'::jsonb
)
ON CONFLICT (path) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, method = EXCLUDED.method,
  description = EXCLUDED.description, min_plan = EXCLUDED.min_plan,
  status = EXCLUDED.status, params = EXCLUDED.params;
