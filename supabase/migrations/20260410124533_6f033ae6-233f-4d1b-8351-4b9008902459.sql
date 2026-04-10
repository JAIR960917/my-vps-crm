
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
BEGIN
  SELECT COALESCE(setting_value, '5')::int INTO _interval_minutes
  FROM system_settings
  WHERE setting_key = 'whatsapp_cron_interval';

  IF _interval_minutes IS NULL THEN
    _interval_minutes := 5;
  END IF;

  _cron_expression := '*/' || _interval_minutes || ' * * * *';

  -- Remove existing job if any
  BEGIN
    PERFORM cron.unschedule('whatsapp-send-cron');
  EXCEPTION WHEN OTHERS THEN
    -- job doesn't exist, ignore
  END;

  _job_command := 'SELECT net.http_post(url := ''' || current_setting('app.settings.supabase_url', true) || '/functions/v1/send-whatsapp'', headers := ''{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.settings.supabase_anon_key', true) || '"}''::jsonb, body := ''{}''::jsonb);';

  PERFORM cron.schedule(
    'whatsapp-send-cron',
    _cron_expression,
    _job_command
  );
END;
$$;
