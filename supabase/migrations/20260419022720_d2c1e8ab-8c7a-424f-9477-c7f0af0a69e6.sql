-- Grant execute on encryption helpers so edge functions (service_role) can decrypt secrets
GRANT EXECUTE ON FUNCTION public.decrypt_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._get_encryption_key() TO service_role;