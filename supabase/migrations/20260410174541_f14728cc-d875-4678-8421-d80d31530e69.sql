
-- Create whatsapp_instances table
CREATE TABLE public.whatsapp_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  session text NOT NULL UNIQUE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on whatsapp_instances"
  ON public.whatsapp_instances FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerentes can manage company instances"
  ON public.whatsapp_instances FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role) AND company_id IS NOT NULL AND company_id = get_my_company_id())
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role) AND company_id IS NOT NULL AND company_id = get_my_company_id());

CREATE POLICY "All authenticated can view instances"
  ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (true);

-- Add instance_id to whatsapp_campaigns
ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- Add instance_id to whatsapp_trigger_campaigns
ALTER TABLE public.whatsapp_trigger_campaigns
  ADD COLUMN instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
