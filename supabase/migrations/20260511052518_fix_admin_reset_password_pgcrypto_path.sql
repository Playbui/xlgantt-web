CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id UUID,
  temp_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF temp_password IS NULL OR length(temp_password) < 6 THEN
    RAISE EXCEPTION 'password too short';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(temp_password, extensions.gen_salt('bf')),
    updated_at = now(),
    email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  UPDATE public.profiles
  SET
    force_password_change = true,
    password_reset_by_admin_at = now(),
    updated_at = now()
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
