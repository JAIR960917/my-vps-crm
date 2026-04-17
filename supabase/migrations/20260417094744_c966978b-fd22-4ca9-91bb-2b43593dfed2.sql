
-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Garantir setting padrão de hora (6h da manhã)
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES ('ssotica_sync_hour', '6')
ON CONFLICT DO NOTHING;

-- Função para gerenciar o cron job de sincronização SSótica
CREATE OR REPLACE FUNCTION public.manage_ssotica_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hour int;
  _cron_expression text;
  _job_command text;
  _url text := 'https://flhycgllttqeczrpmfoc.supabase.co/functions/v1/ssotica-sync';
  _key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaHljZ2xsdHRxZWN6cnBtZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjg0NjAsImV4cCI6MjA5MDkwNDQ2MH0.VjVdVgDzRajcD-2ACZY7-3zFwjP_Ti6pbFIBjW0NnhQ';
BEGIN
  SELECT COALESCE(setting_value, '6')::int INTO _hour
  FROM system_settings
  WHERE setting_key = 'ssotica_sync_hour';

  IF _hour IS NULL OR _hour < 0 OR _hour > 23 THEN
    _hour := 6;
  END IF;

  -- Roda no minuto 0 da hora escolhida (UTC). Brasil = UTC-3, então hora 9 UTC = 6h Brasil
  -- Para usar hora local de Brasília, somamos 3
  _cron_expression := '0 ' || ((_hour + 3) % 24)::text || ' * * *';

  BEGIN
    PERFORM cron.unschedule('ssotica-daily-sync');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  _job_command := 'SELECT net.http_post(url := ''' || _url || ''', headers := ''{"Content-Type":"application/json","Authorization":"Bearer ' || _key || '"}''::jsonb, body := ''{}''::jsonb);';

  PERFORM cron.schedule(
    'ssotica-daily-sync',
    _cron_expression,
    _job_command
  );
END;
$$;

-- Ativar o cron com a hora padrão
SELECT public.manage_ssotica_cron();
