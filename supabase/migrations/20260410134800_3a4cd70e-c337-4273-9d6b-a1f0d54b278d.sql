
-- Trigger-based campaigns (on column entry + follow-ups)
CREATE TABLE public.whatsapp_trigger_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status_id uuid NOT NULL REFERENCES public.crm_statuses(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  daily_limit integer NOT NULL DEFAULT 15,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_trigger_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on trigger_campaigns" ON public.whatsapp_trigger_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerentes can manage company trigger campaigns" ON public.whatsapp_trigger_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente') AND is_same_company(created_by))
  WITH CHECK (has_role(auth.uid(), 'gerente') AND auth.uid() = created_by);

CREATE POLICY "Vendedores can view trigger campaigns" ON public.whatsapp_trigger_campaigns FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_trigger_campaigns_updated_at BEFORE UPDATE ON public.whatsapp_trigger_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Steps within a trigger campaign (up to 5)
CREATE TABLE public.whatsapp_trigger_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_trigger_campaigns(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  delay_days integer NOT NULL DEFAULT 0,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, position)
);

ALTER TABLE public.whatsapp_trigger_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on trigger_steps" ON public.whatsapp_trigger_steps FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerentes can manage company trigger steps" ON public.whatsapp_trigger_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_trigger_campaigns c WHERE c.id = campaign_id AND has_role(auth.uid(), 'gerente') AND is_same_company(c.created_by)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.whatsapp_trigger_campaigns c WHERE c.id = campaign_id AND has_role(auth.uid(), 'gerente') AND auth.uid() = c.created_by));

CREATE POLICY "Vendedores can view trigger steps" ON public.whatsapp_trigger_steps FOR SELECT TO authenticated
  USING (true);

-- Send tracking for trigger campaigns
CREATE TABLE public.whatsapp_trigger_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_trigger_campaigns(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.whatsapp_trigger_steps(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_trigger_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on trigger_sends" ON public.whatsapp_trigger_sends FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Gerentes can view company trigger sends" ON public.whatsapp_trigger_sends FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Vendedores can view trigger sends" ON public.whatsapp_trigger_sends FOR SELECT TO authenticated
  USING (true);
