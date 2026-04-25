ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_card_opens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_lead_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_renovacao_notes;
ALTER TABLE public.lead_card_opens REPLICA IDENTITY FULL;
ALTER TABLE public.crm_lead_notes REPLICA IDENTITY FULL;
ALTER TABLE public.crm_renovacao_notes REPLICA IDENTITY FULL;