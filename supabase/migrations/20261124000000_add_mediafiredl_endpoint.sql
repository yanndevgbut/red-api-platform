INSERT INTO public.endpoints (name, category, method, path, description, min_plan, status, params)
VALUES (
  'MediaFire Downloader (mediafiredl)', 'Downloader', 'GET', '/api/download/mediafiredl',
  'Ambil metadata dan tautan unduh satu file publik MediaFire dari URL HTTPS atau quickkey. Folder tidak didukung. Tautan unduh dapat kedaluwarsa.',
  'free', 'maintenance', '[{"name":"url","type":"string","required":true}]'::jsonb
)
ON CONFLICT (path) DO NOTHING;
