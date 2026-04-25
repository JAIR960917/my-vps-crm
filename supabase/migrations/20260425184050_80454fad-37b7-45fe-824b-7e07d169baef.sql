UPDATE public.ssotica_integrations
SET sync_status = 'idle',
    backfill_next_run_at = NULL,
    updated_at = now()
WHERE id = '5cc5dc5e-0707-4af4-8948-700d77967856'
  AND sync_status = 'running';