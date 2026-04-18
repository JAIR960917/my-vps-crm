ALTER TABLE public.crm_appointments
  ADD COLUMN IF NOT EXISTS renovacao_id uuid REFERENCES public.crm_renovacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_appointments_renovacao_id ON public.crm_appointments(renovacao_id);