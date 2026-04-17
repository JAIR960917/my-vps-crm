
ALTER TABLE public.ssotica_integrations
  ADD COLUMN IF NOT EXISTS backfill_chunk_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS backfill_total_chunks integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS backfill_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS backfill_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS backfill_next_run_at timestamptz;

-- Cria/recria o cron job que processa o próximo chunk a cada minuto.
-- A função decide se deve rodar (verifica backfill_next_run_at) e processa
-- apenas integrações cujo próximo run já passou.
DO $$
BEGIN
  PERFORM cron.unschedule('ssotica-backfill-runner');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'ssotica-backfill-runner',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://flhycgllttqeczrpmfoc.supabase.co/functions/v1/ssotica-sync',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaHljZ2xsdHRxZWN6cnBtZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjg0NjAsImV4cCI6MjA5MDkwNDQ2MH0.VjVdVgDzRajcD-2ACZY7-3zFwjP_Ti6pbFIBjW0NnhQ"}'::jsonb,
    body := '{"mode":"backfill_tick"}'::jsonb
  );
  $$
);
