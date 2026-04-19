-- Destrava o backfill da Loja Caicó-RN que ficou em loop por timeout na reconciliação
-- Marca os logs órfãos (running > 5min sem finished_at) como erro para limpeza visual
UPDATE public.ssotica_sync_logs
SET status = 'error',
    finished_at = now(),
    error_message = 'Cancelado: chunk reprocessado por timeout. Substituído por nova execução.'
WHERE status = 'running'
  AND finished_at IS NULL
  AND started_at < now() - interval '5 minutes';

-- Reseta o agendamento do próximo run para "agora" para que o cron pegue
-- (mantém chunk_index=0 — vai retomar de onde parou com a lógica corrigida)
UPDATE public.ssotica_integrations
SET backfill_next_run_at = now(),
    sync_status = 'running',
    last_error = NULL
WHERE company_id = '83773a1c-1bb0-453e-9cb5-c6538a7dd8c3'
  AND backfill_status = 'running';