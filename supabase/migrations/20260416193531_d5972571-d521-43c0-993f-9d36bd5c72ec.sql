-- Notes table for cobrancas
CREATE TABLE public.crm_cobranca_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cobranca_id UUID NOT NULL REFERENCES public.crm_cobrancas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_cobranca_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View notes of accessible cobrancas"
ON public.crm_cobranca_notes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.crm_cobrancas c
    WHERE c.id = crm_cobranca_notes.cobranca_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'financeiro'::app_role)
        OR c.assigned_to = auth.uid()
        OR c.created_by = auth.uid()
        OR is_same_company(c.assigned_to)
        OR is_same_company(c.created_by)
      )
  )
);

CREATE POLICY "Insert notes on accessible cobrancas"
ON public.crm_cobranca_notes FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.crm_cobrancas c
    WHERE c.id = crm_cobranca_notes.cobranca_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'financeiro'::app_role)
        OR c.assigned_to = auth.uid()
        OR c.created_by = auth.uid()
        OR is_same_company(c.assigned_to)
        OR is_same_company(c.created_by)
      )
  )
);

CREATE POLICY "Update own notes"
ON public.crm_cobranca_notes FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Delete own notes or admin"
ON public.crm_cobranca_notes FOR DELETE TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Activities (tasks) table for cobrancas
CREATE TABLE public.cobranca_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cobranca_id UUID NOT NULL REFERENCES public.crm_cobrancas(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cobranca_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View activities of accessible cobrancas"
ON public.cobranca_activities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.crm_cobrancas c
    WHERE c.id = cobranca_activities.cobranca_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'financeiro'::app_role)
        OR c.assigned_to = auth.uid()
        OR c.created_by = auth.uid()
        OR is_same_company(c.assigned_to)
        OR is_same_company(c.created_by)
      )
  )
);

CREATE POLICY "Insert activities on accessible cobrancas"
ON public.cobranca_activities FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM public.crm_cobrancas c
    WHERE c.id = cobranca_activities.cobranca_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'financeiro'::app_role)
        OR c.assigned_to = auth.uid()
        OR c.created_by = auth.uid()
        OR is_same_company(c.assigned_to)
        OR is_same_company(c.created_by)
      )
  )
);

CREATE POLICY "Update own activities or admin"
ON public.cobranca_activities FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Delete own activities or admin"
ON public.cobranca_activities FOR DELETE TO authenticated
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_cobranca_activities_updated_at
BEFORE UPDATE ON public.cobranca_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_crm_cobranca_notes_cobranca ON public.crm_cobranca_notes(cobranca_id);
CREATE INDEX idx_cobranca_activities_cobranca ON public.cobranca_activities(cobranca_id);