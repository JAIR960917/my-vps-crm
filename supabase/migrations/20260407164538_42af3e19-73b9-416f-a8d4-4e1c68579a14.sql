
CREATE TABLE public.crm_lead_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view notes"
  ON public.crm_lead_notes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can create notes"
  ON public.crm_lead_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can delete notes"
  ON public.crm_lead_notes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
