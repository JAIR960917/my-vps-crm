-- 1) whatsapp_campaign_sends
DROP POLICY IF EXISTS "Vendedores can view campaign sends" ON public.whatsapp_campaign_sends;
DROP POLICY IF EXISTS "Gerentes can view company campaign sends" ON public.whatsapp_campaign_sends;
CREATE POLICY "Scoped campaign sends visibility"
ON public.whatsapp_campaign_sends FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.whatsapp_campaigns c
    WHERE c.id = whatsapp_campaign_sends.campaign_id
      AND (c.created_by = auth.uid() OR (c.company_id IS NOT NULL AND is_my_company(c.company_id)))
  )
);

-- 2) whatsapp_trigger_sends
DROP POLICY IF EXISTS "Vendedores can view trigger sends" ON public.whatsapp_trigger_sends;
DROP POLICY IF EXISTS "Gerentes can view company trigger sends" ON public.whatsapp_trigger_sends;
CREATE POLICY "Scoped trigger sends visibility"
ON public.whatsapp_trigger_sends FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.whatsapp_trigger_campaigns c
    WHERE c.id = whatsapp_trigger_sends.campaign_id
      AND (c.created_by = auth.uid() OR (c.company_id IS NOT NULL AND is_my_company(c.company_id)))
  )
);

-- 3) bucket whatsapp-media
DROP POLICY IF EXISTS "Authenticated delete whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload whatsapp media" ON storage.objects;
CREATE POLICY "Users upload own whatsapp media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own whatsapp media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'whatsapp-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users delete own whatsapp media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'whatsapp-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR has_role(auth.uid(), 'admin'::app_role)));

-- 4) crm_appointments WITH CHECK
DROP POLICY IF EXISTS "Vendedores can update own appointments" ON public.crm_appointments;
CREATE POLICY "Vendedores can update own appointments"
ON public.crm_appointments FOR UPDATE TO authenticated
USING (scheduled_by = auth.uid())
WITH CHECK (scheduled_by = auth.uid());

-- 5) Criptografia em repouso para tokens da SSótica
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._get_encryption_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest('ssotica_token_key_' || coalesce(current_setting('app.settings.jwt_secret', true), 'fallback_salt'), 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.encrypt_secret(_plaintext text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _key text;
BEGIN
  IF _plaintext IS NULL OR _plaintext = '' THEN RETURN _plaintext; END IF;
  IF _plaintext LIKE 'enc:%' THEN RETURN _plaintext; END IF;
  _key := public._get_encryption_key();
  RETURN 'enc:' || encode(extensions.encrypt(_plaintext::bytea, _key::bytea, 'aes'), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_secret(_ciphertext text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE _key text;
BEGIN
  IF _ciphertext IS NULL OR _ciphertext = '' THEN RETURN _ciphertext; END IF;
  IF _ciphertext NOT LIKE 'enc:%' THEN RETURN _ciphertext; END IF;
  _key := public._get_encryption_key();
  RETURN convert_from(extensions.decrypt(decode(substring(_ciphertext FROM 5), 'base64'), _key::bytea, 'aes'), 'UTF8');
END;
$$;

CREATE OR REPLACE FUNCTION public._encrypt_ssotica_secrets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.bearer_token IS NOT NULL AND NEW.bearer_token <> '' THEN
    NEW.bearer_token := public.encrypt_secret(NEW.bearer_token);
  END IF;
  IF NEW.license_code IS NOT NULL AND NEW.license_code <> '' THEN
    NEW.license_code := public.encrypt_secret(NEW.license_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_ssotica_secrets_trigger ON public.ssotica_integrations;
CREATE TRIGGER encrypt_ssotica_secrets_trigger
BEFORE INSERT OR UPDATE OF bearer_token, license_code
ON public.ssotica_integrations
FOR EACH ROW EXECUTE FUNCTION public._encrypt_ssotica_secrets();

-- Migrar somente registros com valor presente
UPDATE public.ssotica_integrations
SET bearer_token = public.encrypt_secret(bearer_token)
WHERE bearer_token IS NOT NULL AND bearer_token <> '' AND bearer_token NOT LIKE 'enc:%';

UPDATE public.ssotica_integrations
SET license_code = public.encrypt_secret(license_code)
WHERE license_code IS NOT NULL AND license_code <> '' AND license_code NOT LIKE 'enc:%';

REVOKE EXECUTE ON FUNCTION public.decrypt_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._get_encryption_key() FROM PUBLIC, anon, authenticated;

-- 6) Limpar policies duplicadas no role "public"
DROP POLICY IF EXISTS "Admins can delete any activity" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can delete any notification" ON public.notifications;
DROP POLICY IF EXISTS "Admins can delete any scheduled message" ON public.scheduled_whatsapp_messages;
DROP POLICY IF EXISTS "Admins can delete any campaign send" ON public.whatsapp_campaign_sends;
