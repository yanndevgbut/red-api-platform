BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND banned IS FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.rotate_my_api_key()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  account_id uuid := auth.uid();
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = account_id AND banned IS FALSE FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active account is required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.api_keys SET is_active = false WHERE user_id = account_id AND is_active;
  INSERT INTO public.api_keys (user_id, key)
  VALUES (account_id, 'red_live_' || encode(extensions.gen_random_bytes(24), 'hex'));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rotate_my_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_my_api_key() TO authenticated;

-- Preserve the current day's balance on upgrade. The first call of each new day
-- resets the account even if a scheduled reset was missed.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS quota_day date NOT NULL
  DEFAULT ((now() AT TIME ZONE 'Asia/Jakarta')::date);

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

-- Keep older nodes compatible during the migration.
CREATE OR REPLACE FUNCTION public.deduct_user_quota(user_key text)
RETURNS TABLE(valid boolean, remaining int, plan public.user_plan, reason text)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT a.valid, a.remaining, a.plan, a.reason
  FROM public.authorize_api_request(user_key, NULL, NULL, 'free') a;
$$;

CREATE OR REPLACE FUNCTION public.reset_daily_limits()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.profiles
  SET limit_remaining = limit_daily,
      quota_day = (now() AT TIME ZONE 'Asia/Jakarta')::date,
      updated_at = now()
  WHERE banned IS FALSE AND quota_day < (now() AT TIME ZONE 'Asia/Jakarta')::date;
$$;

REVOKE EXECUTE ON FUNCTION public.authorize_api_request(text, text, text, public.user_plan)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_user_quota(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_daily_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_api_request(text, text, text, public.user_plan) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_user_quota(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_daily_limits() TO service_role;

COMMIT;
