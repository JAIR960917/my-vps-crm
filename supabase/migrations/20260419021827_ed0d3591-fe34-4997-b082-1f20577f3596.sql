GRANT EXECUTE ON FUNCTION public.decrypt_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._get_encryption_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ssotica_credentials(uuid) TO service_role;
