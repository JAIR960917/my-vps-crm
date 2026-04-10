
CREATE OR REPLACE FUNCTION public.manage_whatsapp_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _interval_minutes int;
  _cron_expression text;
  _job_command text;
  _url text := 'https://flhycgllttqeczrpmfoc.supabase.co/functions/v1/send-whatsapp';
  _key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaHljZ2xsdHRxZWN6cnBtZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjg0NjAsImV4cCI6MjA5MDkwNDQ2MH0.VjVdVgDzRajcD-2ACZY7-3zFwjP_Ti6pbFIBjW0NnhQ';
BEGIN
  SELECT COALESCE(setting_value, '5')::int INTO _interval_minutes
  FROM system_settings
  WHERE setting_key = 'whatsapp_cron_interval';

  IF _interval_minutes IS NULL THEN
    _interval_minutes := 5;
  END IF;

  _cron_expression := '*/' || _interval_minutes || ' * * * *';

  BEGIN
    PERFORM cron.unschedule('whatsapp-send-cron');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  _job_command := 'SELECT net.http_post(url := ''' || _url || ''', headers := ''{"Content-Type":"application/json","Authorization":"Bearer ' || _key || '"}''::jsonb, body := ''{}''::jsonb);';

  PERFORM cron.schedule(
    'whatsapp-send-cron',
    _cron_expression,
    _job_command
  );
END;
$$;
