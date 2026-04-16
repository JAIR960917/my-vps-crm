
ALTER TABLE public.crm_cobrancas ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX idx_crm_cobrancas_company_id ON public.crm_cobrancas(company_id);
