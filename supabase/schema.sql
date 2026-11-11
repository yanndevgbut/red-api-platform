-- ==============================================================================
-- RED/API PLATFORM — SUPABASE PRODUCTION DATABASE SCHEMA
-- ==============================================================================

-- 1. EXTENSIONS
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- 2. CUSTOM TYPES & ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_plan AS ENUM ('free', 'basic', 'vip', 'enterprise');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE endpoint_status AS ENUM ('active', 'maintenance', 'deprecated');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES TABLE (Linked with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  role user_role DEFAULT 'user',
  plan user_plan DEFAULT 'free',
  limit_daily INT DEFAULT 100,
  limit_remaining INT DEFAULT 100,
  banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. API KEYS TABLE
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for instant key lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_lookup ON public.api_keys(key) WHERE is_active = TRUE;

-- 5. ENDPOINTS REGISTRY TABLE
CREATE TABLE IF NOT EXISTS public.endpoints (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
  path TEXT UNIQUE NOT NULL,
  description TEXT,
  min_plan user_plan DEFAULT 'free',
  status endpoint_status DEFAULT 'active',
  params JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. API ACCESS LOGS TABLE
CREATE TABLE IF NOT EXISTS public.api_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address TEXT,
  method TEXT NOT NULL,
  endpoint_path TEXT NOT NULL,
  status_code INT NOT NULL,
  latency_ms INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for log querying & metrics
CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON public.api_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON public.api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_path ON public.api_logs(endpoint_path);

-- 7. SYSTEM SETTINGS TABLE (Maintenance controller)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_mode BOOLEAN DEFAULT FALSE,
  maintenance_message TEXT DEFAULT 'System under scheduled maintenance. Endpoints returning 503.',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.system_settings (id, maintenance_mode)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 8. TRIGGER: AUTO CREATE PROFILE & API KEY ON REGISTRATION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_username TEXT;
  generated_key TEXT;
BEGIN
  new_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  generated_key := 'red_live_' || encode(extensions.gen_random_bytes(16), 'hex');

  -- Create default profile
  INSERT INTO public.profiles (id, username, email, role, plan, limit_daily, limit_remaining)
  VALUES (NEW.id, new_username, NEW.email, 'user'::public.user_role, 'free'::public.user_plan, 100, 100);

  -- Create initial active API Key
  INSERT INTO public.api_keys (user_id, key)
  VALUES (NEW.id, generated_key);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. FUNCTION: DEDUCT QUOTA (Atomic operation called by backend)
CREATE OR REPLACE FUNCTION public.deduct_user_quota(user_key TEXT)
RETURNS TABLE(valid BOOLEAN, remaining INT, plan user_plan, reason TEXT) AS $$
DECLARE
  target_user_id UUID;
  target_plan user_plan;
  target_banned BOOLEAN;
  target_remaining INT;
BEGIN
  -- Check Key Validity
  SELECT k.user_id, p.plan, p.banned, p.limit_remaining
  INTO target_user_id, target_plan, target_banned, target_remaining
  FROM public.api_keys k
  JOIN public.profiles p ON p.id = k.user_id
  WHERE k.key = user_key AND k.is_active = TRUE;

  IF target_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'free'::user_plan, 'INVALID_API_KEY';
    RETURN;
  END IF;

  IF target_banned THEN
    RETURN QUERY SELECT FALSE, 0, target_plan, 'USER_BANNED';
    RETURN;
  END IF;

  -- Unlimited for Enterprise plan
  IF target_plan = 'enterprise' THEN
    RETURN QUERY SELECT TRUE, 999999, target_plan, 'OK';
    RETURN;
  END IF;

  IF target_remaining <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, target_plan, 'QUOTA_EXCEEDED';
    RETURN;
  END IF;

  -- Atomic quota decrement
  UPDATE public.profiles
  SET limit_remaining = limit_remaining - 1,
      updated_at = NOW()
  WHERE id = target_user_id;

  RETURN QUERY SELECT TRUE, target_remaining - 1, target_plan, 'OK';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. FUNCTION: RESET DAILY QUOTAS (Scheduled via pg_cron at 00:00 WIB)
CREATE OR REPLACE FUNCTION public.reset_daily_limits()
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET limit_remaining = limit_daily,
      updated_at = NOW()
  WHERE banned = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Helper: SECURITY DEFINER to prevent infinite recursion in RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND banned IS FALSE
  );
$$;

-- Profiles Policies
DROP POLICY IF EXISTS "User read own profile" ON public.profiles;
CREATE POLICY "User read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admin full access profiles" ON public.profiles;
CREATE POLICY "Admin full access profiles" ON public.profiles
  FOR ALL USING (public.is_admin());

-- API Keys Policies
DROP POLICY IF EXISTS "User read own api_keys" ON public.api_keys;
CREATE POLICY "User read own api_keys" ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin full access api_keys" ON public.api_keys;
CREATE POLICY "Admin full access api_keys" ON public.api_keys
  FOR ALL USING (public.is_admin());

-- Endpoints Policies
DROP POLICY IF EXISTS "Public read active endpoints" ON public.endpoints;
CREATE POLICY "Public read active endpoints" ON public.endpoints
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admin full access endpoints" ON public.endpoints;
CREATE POLICY "Admin full access endpoints" ON public.endpoints
  FOR ALL USING (public.is_admin());

-- Logs Policies
DROP POLICY IF EXISTS "User read own logs" ON public.api_logs;
CREATE POLICY "User read own logs" ON public.api_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin full access logs" ON public.api_logs;
CREATE POLICY "Admin full access logs" ON public.api_logs
  FOR ALL USING (public.is_admin());

-- System Settings Policies
DROP POLICY IF EXISTS "Public read system settings" ON public.system_settings;
CREATE POLICY "Public read system settings" ON public.system_settings
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admin update system settings" ON public.system_settings;
CREATE POLICY "Admin update system settings" ON public.system_settings
  FOR UPDATE USING (public.is_admin());

-- Feature endpoints are registered explicitly; retired beta routes are not seeded.

REVOKE EXECUTE ON FUNCTION public.deduct_user_quota(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_daily_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_user_quota(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_daily_limits() TO service_role;
