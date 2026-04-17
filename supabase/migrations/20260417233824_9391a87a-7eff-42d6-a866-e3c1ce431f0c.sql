UPDATE public.ssotica_integrations
SET sync_status = 'idle', backfill_status = 'idle', backfill_next_run_at = NULL
WHERE sync_status = 'running' OR backfill_status IN ('running','scheduled');