
CREATE TABLE public.scheduled_whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access on scheduled_whatsapp_messages"
ON public.scheduled_whatsapp_messages
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Gerentes can manage company messages
CREATE POLICY "Gerentes can view scheduled messages"
ON public.scheduled_whatsapp_messages
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'gerente'::app_role) 
  AND is_same_company(created_by)
);

CREATE POLICY "Gerentes can insert scheduled messages"
ON public.scheduled_whatsapp_messages
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'gerente'::app_role) 
  AND auth.uid() = created_by
);

CREATE POLICY "Gerentes can update scheduled messages"
ON public.scheduled_whatsapp_messages
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'gerente'::app_role) 
  AND is_same_company(created_by)
);

CREATE POLICY "Gerentes can delete scheduled messages"
ON public.scheduled_whatsapp_messages
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'gerente'::app_role) 
  AND is_same_company(created_by)
);

-- Vendedores can view and create their own
CREATE POLICY "Vendedores can view own scheduled messages"
ON public.scheduled_whatsapp_messages
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "Vendedores can insert own scheduled messages"
ON public.scheduled_whatsapp_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Vendedores can delete own pending messages"
ON public.scheduled_whatsapp_messages
FOR DELETE
TO authenticated
USING (auth.uid() = created_by AND status = 'pending');

-- Trigger for updated_at
CREATE TRIGGER update_scheduled_whatsapp_messages_updated_at
BEFORE UPDATE ON public.scheduled_whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
