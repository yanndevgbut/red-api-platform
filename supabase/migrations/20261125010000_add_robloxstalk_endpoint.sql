INSERT INTO public.endpoints (name, category, method, path, description, min_plan, status, params)
VALUES (
  'Roblox Stalk (robloxstalk)', 'Stalk', 'GET', '/api/stalk/robloxstalk',
  'Lihat profil publik Roblox: nama tampilan, bio, tanggal dibuat, status verifikasi, jumlah teman/pengikut, avatar, headshot, grup, dan pengalaman publik. Parameter username menerima nama akun Roblox (bukan display name) dengan atau tanpa @.',
  'free', 'maintenance', '[{"name":"username","type":"string","required":true}]'::jsonb
)
ON CONFLICT (path) DO NOTHING;
