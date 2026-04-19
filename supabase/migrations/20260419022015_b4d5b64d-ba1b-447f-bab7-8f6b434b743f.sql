-- Wrapper que só admin pode chamar para ler license_code descriptografado
CREATE OR REPLACE FUNCTION public.admin_decrypt_license(_integration_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ciphertext text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  SELECT license_code INTO _ciphertext
  FROM public.ssotica_integrations
  WHERE id = _integration_id;
  RETURN public.decrypt_secret(_ciphertext);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_decrypt_license(uuid) TO authenticated;
