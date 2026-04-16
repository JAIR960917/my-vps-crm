ALTER TABLE public.whatsapp_campaigns ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.whatsapp_trigger_campaigns ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX idx_whatsapp_campaigns_company_id ON public.whatsapp_campaigns(company_id);
CREATE INDEX idx_whatsapp_trigger_campaigns_company_id ON public.whatsapp_trigger_campaigns(company_id);