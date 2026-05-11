CREATE OR REPLACE FUNCTION public.complete_forced_password_change()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  UPDATE public.profiles
  SET
    force_password_change = false,
    updated_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_forced_password_change() TO authenticated;
