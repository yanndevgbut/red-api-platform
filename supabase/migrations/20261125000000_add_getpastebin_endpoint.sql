INSERT INTO public.endpoints (name, category, method, path, description, min_plan, status, params)
VALUES (
  'Pastebin Get (getpastebin)', 'Tools', 'GET', '/api/tools/getpastebin',
  'Ambil isi paste publik Pastebin dari URL HTTPS berisi ID 8 karakter. Isi dibatasi 2 MiB dan hanya teks UTF-8; hash SHA-256 disertakan.',
  'free', 'maintenance', '[{"name":"url","type":"string","required":true}]'::jsonb
)
ON CONFLICT (path) DO NOTHING;
