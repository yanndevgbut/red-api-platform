INSERT INTO public.endpoints (name, category, method, path, description, min_plan, status, params)
VALUES (
  'Free Fire Stalker', 'Stalk', 'GET', '/api/stalk/ff',
  'Cari profil publik Free Fire berdasarkan UID: nickname, rank, level, region, bio, dan estimasi top-up nonresmi.',
  'free', 'active', '[{"name":"uid","type":"string","required":true}]'::jsonb
)
ON CONFLICT (path) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, method = EXCLUDED.method,
  description = EXCLUDED.description, min_plan = EXCLUDED.min_plan,
  status = EXCLUDED.status, params = EXCLUDED.params;
