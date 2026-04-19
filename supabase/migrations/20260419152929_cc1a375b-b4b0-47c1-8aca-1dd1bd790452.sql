-- Reset backfill da Caicó-RN com nova configuração (16 chunks de 6 meses)
UPDATE public.ssotica_integrations
SET 
  backfill_chunk_index = 0,
  backfill_total_chunks = 16,
  backfill_status = 'running',
  backfill_started_at = now(),
  backfill_next_run_at = now(),
  sync_status = 'running',
  last_error = NULL
WHERE company_id = '83773a1c-1bb0-453e-9cb5-c6538a7dd8c3';

-- Limpa logs órfãos travados em "running" do reset anterior
UPDATE public.ssotica_sync_logs
SET 
  status = 'error',
  error_message = 'Cancelado: reset para nova configuração de chunks (6 meses)',
  finished_at = now()
WHERE status = 'running'
  AND integration_id IN (
    SELECT id FROM public.ssotica_integrations 
    WHERE company_id = '83773a1c-1bb0-453e-9cb5-c6538a7dd8c3'
  );