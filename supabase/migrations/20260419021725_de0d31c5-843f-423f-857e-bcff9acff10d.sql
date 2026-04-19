CREATE OR REPLACE FUNCTION public.get_ssotica_credentials(_integration_id uuid)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  cnpj text,
  bearer_token text,
  license_code text,
  is_active boolean,
  initial_sync_done boolean,
  last_sync_vendas_at timestamptz,
  last_sync_receber_at timestamptz,
  sync_status text,
  backfill_status text,
  backfill_chunk_index int,
  backfill_total_chunks int,
  backfill_started_at timestamptz,
  backfill_next_run_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.company_id,
    i.cnpj,
    public.decrypt_secret(i.bearer_token) AS bearer_token,
    public.decrypt_secret(i.license_code) AS license_code,
    i.is_active,
    i.initial_sync_done,
    i.last_sync_vendas_at,
    i.last_sync_receber_at,
    i.sync_status,
    i.backfill_status,
    i.backfill_chunk_index,
    i.backfill_total_chunks,
    i.backfill_started_at,
    i.backfill_next_run_at
  FROM public.ssotica_integrations i
  WHERE i.id = _integration_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ssotica_credentials(uuid) FROM PUBLIC, anon, authenticated;
-- service_role mantém acesso por padrão
