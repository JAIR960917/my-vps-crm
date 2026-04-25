-- Habilitar realtime nas tabelas principais para atualização automática sem refresh
ALTER TABLE public.crm_leads REPLICA IDENTITY FULL;
ALTER TABLE public.crm_renovacoes REPLICA IDENTITY FULL;
ALTER TABLE public.crm_cobrancas REPLICA IDENTITY FULL;
ALTER TABLE public.crm_appointments REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_leads;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_renovacoes;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_cobrancas;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_appointments;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;