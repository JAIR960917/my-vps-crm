
CREATE TABLE public.crm_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  scheduled_by UUID NOT NULL,
  scheduled_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  forma_pagamento TEXT NOT NULL DEFAULT '',
  canal_agendamento TEXT NOT NULL DEFAULT '',
  confirmacao TEXT NOT NULL DEFAULT 'pendente',
  comparecimento TEXT NOT NULL DEFAULT 'pendente',
  venda TEXT NOT NULL DEFAULT 'pendente',
  resumo TEXT DEFAULT '',
  previous_status TEXT NOT NULL DEFAULT 'novo',
  status TEXT NOT NULL DEFAULT 'agendado',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on appointments"
ON public.crm_appointments FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerentes can manage company appointments"
ON public.crm_appointments FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(scheduled_by))
WITH CHECK (has_role(auth.uid(), 'gerente'::app_role) AND (auth.uid() = scheduled_by));

CREATE POLICY "Vendedores can view own appointments"
ON public.crm_appointments FOR SELECT
TO authenticated
USING (scheduled_by = auth.uid());

CREATE POLICY "Vendedores can insert own appointments"
ON public.crm_appointments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = scheduled_by);

CREATE POLICY "Vendedores can update own appointments"
ON public.crm_appointments FOR UPDATE
TO authenticated
USING (scheduled_by = auth.uid());

CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.crm_appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
