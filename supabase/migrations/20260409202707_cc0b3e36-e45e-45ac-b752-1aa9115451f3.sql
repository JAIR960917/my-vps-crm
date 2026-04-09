
-- Create whatsapp_campaigns table
CREATE TABLE public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message text NOT NULL,
  status_id uuid NOT NULL REFERENCES public.crm_statuses(id) ON DELETE CASCADE,
  daily_limit integer NOT NULL DEFAULT 15,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on whatsapp_campaigns" ON public.whatsapp_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerentes can manage company campaigns" ON public.whatsapp_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(created_by))
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role) AND auth.uid() = created_by);

CREATE POLICY "Vendedores can view campaigns" ON public.whatsapp_campaigns FOR SELECT TO authenticated
  USING (true);

-- Create whatsapp_campaign_sends table to track individual sends
CREATE TABLE public.whatsapp_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, lead_id)
);

ALTER TABLE public.whatsapp_campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on campaign_sends" ON public.whatsapp_campaign_sends FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerentes can view company campaign sends" ON public.whatsapp_campaign_sends FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Vendedores can view campaign sends" ON public.whatsapp_campaign_sends FOR SELECT TO authenticated
  USING (true);

-- Trigger for updated_at on campaigns
CREATE TRIGGER update_whatsapp_campaigns_updated_at
  BEFORE UPDATE ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
