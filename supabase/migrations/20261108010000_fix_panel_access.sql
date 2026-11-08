BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND banned IS FALSE);
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.authorize_api_request(
  user_key text, request_method text, request_path text, required_plan public.user_plan
)
RETURNS TABLE(valid boolean, remaining int, plan public.user_plan, reason text, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  account_id uuid;
  account public.profiles%ROWTYPE;
  endpoint public.endpoints%ROWTYPE;
  quota int;
  today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  SELECT k.user_id INTO account_id FROM public.api_keys k
  WHERE k.key = user_key AND k.is_active;

  IF account_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 'free'::public.user_plan, 'INVALID_API_KEY', NULL::uuid;
    RETURN;
  END IF;

  SELECT p.* INTO account FROM public.profiles p WHERE p.id = account_id FOR UPDATE;
  -- Key rotation takes the same account lock before changing active keys.
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.api_keys k WHERE k.user_id = account_id AND k.key = user_key AND k.is_active
  ) THEN
    RETURN QUERY SELECT false, 0, 'free'::public.user_plan, 'INVALID_API_KEY', NULL::uuid;
    RETURN;
  END IF;

  IF account.banned IS DISTINCT FROM false THEN
    RETURN QUERY SELECT false, 0, account.plan, 'USER_BANNED', account_id;
    RETURN;
  END IF;

  SELECT e.* INTO endpoint FROM public.endpoints e WHERE e.path = request_path;
  -- The compatibility RPC intentionally omits both registry arguments.
  IF (request_path IS NOT NULL OR request_method IS NOT NULL) AND NOT FOUND THEN
    RETURN QUERY SELECT false, 0, account.plan, 'ENDPOINT_UNAVAILABLE', account_id;
    RETURN;
  END IF;
  IF FOUND THEN
    IF endpoint.status = 'deprecated' OR endpoint.method <> request_method THEN
      RETURN QUERY SELECT false, 0, account.plan, 'ENDPOINT_UNAVAILABLE', account_id;
      RETURN;
    END IF;
    IF endpoint.status = 'maintenance' THEN
      RETURN QUERY SELECT false, 0, account.plan, 'ENDPOINT_MAINTENANCE', account_id;
      RETURN;
    END IF;
  END IF;

  IF coalesce(account.plan, 'free'::public.user_plan) < greatest(required_plan, endpoint.min_plan) THEN
    RETURN QUERY SELECT false, 0, account.plan, 'PLAN_REQUIRED', account_id;
    RETURN;
  END IF;

  IF account.plan = 'enterprise' THEN
    RETURN QUERY SELECT true, 999999, account.plan, 'OK', account_id;
    RETURN;
  END IF;

  quota := CASE WHEN account.quota_day < today THEN account.limit_daily ELSE account.limit_remaining END;
  IF coalesce(quota, 0) <= 0 THEN
    RETURN QUERY SELECT false, 0, account.plan, 'QUOTA_EXCEEDED', account_id;
    RETURN;
  END IF;

  UPDATE public.profiles p
  SET limit_remaining = quota - 1, quota_day = today, updated_at = now()
  WHERE p.id = account_id
  RETURNING p.limit_remaining INTO quota;

  RETURN QUERY SELECT true, quota, account.plan, 'OK', account_id;
END;
$$;



-- User-controlled usernames and common email prefixes must not break signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  base_name text;
BEGIN
  base_name := left(coalesce(nullif(btrim(NEW.raw_user_meta_data->>'username'), ''), nullif(split_part(NEW.email, '@', 1), ''), 'user'), 48);
  INSERT INTO public.profiles (id, username, email, role, plan, limit_daily, limit_remaining)
  VALUES (NEW.id, base_name || '_' || replace(NEW.id::text, '-', ''), coalesce(NEW.email, ''), 'user', 'free', 100, 100);
  INSERT INTO public.api_keys (user_id, key)
  VALUES (NEW.id, 'red_live_' || encode(extensions.gen_random_bytes(24), 'hex'));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
