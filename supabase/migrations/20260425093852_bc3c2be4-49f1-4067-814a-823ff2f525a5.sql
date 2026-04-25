CREATE OR REPLACE FUNCTION public.manage_ssotica_cron()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _hour int;
  _h1 int; _h2 int; _h3 int; _h4 int;
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

  _h1 := (_hour + 3) % 24;
  _h2 := (_hour + 9) % 24;
  _h3 := (_hour + 15) % 24;
  _h4 := (_hour + 21) % 24;

  _cron_expression := '0 ' || _h1 || ',' || _h2 || ',' || _h3 || ',' || _h4 || ' * * *';

  BEGIN
    PERFORM cron.unschedule('ssotica-daily-sync');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.unschedule('ssotica-sync-cron');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.unschedule('ssotica-hourly-sync');
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
$function$;

SELECT public.manage_ssotica_cron();