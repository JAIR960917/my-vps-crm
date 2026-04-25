CREATE OR REPLACE FUNCTION public.delete_all_leads_cascade()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta ação';
  END IF;

  DELETE FROM public.crm_lead_notes
    WHERE lead_id IN (SELECT id FROM public.crm_leads);

  DELETE FROM public.lead_activities
    WHERE lead_id IN (SELECT id FROM public.crm_leads);

  DELETE FROM public.crm_appointments
    WHERE lead_id IN (SELECT id FROM public.crm_leads);

  DELETE FROM public.notifications
    WHERE lead_id IN (SELECT id FROM public.crm_leads);

  DELETE FROM public.whatsapp_campaign_sends
    WHERE lead_id IN (SELECT id FROM public.crm_leads);

  DELETE FROM public.whatsapp_trigger_sends
    WHERE lead_id IN (SELECT id FROM public.crm_leads);

  DELETE FROM public.scheduled_whatsapp_messages
    WHERE lead_id IN (SELECT id FROM public.crm_leads);

  WITH d AS (
    DELETE FROM public.crm_leads WHERE id IS NOT NULL RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM d;

  RETURN jsonb_build_object('deleted_leads', deleted_count);
END;
$$;