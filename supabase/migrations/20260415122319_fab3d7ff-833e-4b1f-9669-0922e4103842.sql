
CREATE TABLE public.lead_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on lead_activities"
ON public.lead_activities FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view activities of accessible leads"
ON public.lead_activities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM crm_leads l
    WHERE l.id = lead_activities.lead_id
    AND (
      l.assigned_to = auth.uid()
      OR l.created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'gerente'::app_role) AND (is_same_company(l.assigned_to) OR is_same_company(l.created_by)))
    )
  )
);

CREATE POLICY "Users can insert activities on accessible leads"
ON public.lead_activities FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM crm_leads l
    WHERE l.id = lead_activities.lead_id
    AND (
      l.assigned_to = auth.uid()
      OR l.created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'gerente'::app_role) AND (is_same_company(l.assigned_to) OR is_same_company(l.created_by)))
    )
  )
);

CREATE POLICY "Users can update own activities"
ON public.lead_activities FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own activities"
ON public.lead_activities FOR DELETE TO authenticated
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_lead_activities_lead_id ON public.lead_activities(lead_id);
CREATE INDEX idx_lead_activities_scheduled_date ON public.lead_activities(scheduled_date);
