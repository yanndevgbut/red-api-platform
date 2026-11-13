BEGIN;
-- No extension lookup is required: gen_random_uuid is built into supported PostgreSQL versions.
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
  VALUES (account_id, 'red_live_' || replace(pg_catalog.gen_random_uuid()::text, '-', '') || replace(pg_catalog.gen_random_uuid()::text, '-', ''));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rotate_my_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_my_api_key() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
