BEGIN;
-- Admin RLS must revoke privileged access immediately when an account is banned.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND banned IS FALSE);
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
-- Privileged quota mutations must never be callable with a browser/member JWT.
REVOKE EXECUTE ON FUNCTION public.deduct_user_quota(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_daily_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_user_quota(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_daily_limits() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
