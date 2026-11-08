-- ============================================================
-- FIX INFINITE RECURSION IN SUPABASE RLS POLICIES
-- Jalankan skrip ini di Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Buat fungsi helper SECURITY DEFINER (memutus loop rekursi RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. Perbaiki Policy Tabel Profiles
DROP POLICY IF EXISTS "Admin full access profiles" ON public.profiles;
CREATE POLICY "Admin full access profiles" ON public.profiles
  FOR ALL USING (public.is_admin());

-- 3. Perbaiki Policy Tabel API Keys
DROP POLICY IF EXISTS "Admin full access api_keys" ON public.api_keys;
CREATE POLICY "Admin full access api_keys" ON public.api_keys
  FOR ALL USING (public.is_admin());

-- 4. Perbaiki Policy Tabel Endpoints (Buka akses SELECT untuk semua user)
DROP POLICY IF EXISTS "Admin full access endpoints" ON public.endpoints;
CREATE POLICY "Admin full access endpoints" ON public.endpoints
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Public read active endpoints" ON public.endpoints;
CREATE POLICY "Public read active endpoints" ON public.endpoints
  FOR SELECT USING (TRUE);

-- 5. Perbaiki Policy Tabel API Logs
DROP POLICY IF EXISTS "Admin full access logs" ON public.api_logs;
CREATE POLICY "Admin full access logs" ON public.api_logs
  FOR ALL USING (public.is_admin());

-- 6. Perbaiki Policy Tabel System Settings
DROP POLICY IF EXISTS "Admin update system settings" ON public.system_settings;
CREATE POLICY "Admin update system settings" ON public.system_settings
  FOR UPDATE USING (public.is_admin());
