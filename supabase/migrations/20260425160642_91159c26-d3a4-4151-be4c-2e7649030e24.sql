-- Track every time a salesperson opens a card for editing
CREATE TABLE public.lead_card_opens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('lead','renovacao')),
  lead_id UUID NULL,
  renovacao_id UUID NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_card_opens_user_date ON public.lead_card_opens (user_id, opened_at);
CREATE INDEX idx_lead_card_opens_lead ON public.lead_card_opens (lead_id);
CREATE INDEX idx_lead_card_opens_renovacao ON public.lead_card_opens (renovacao_id);

ALTER TABLE public.lead_card_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own card opens"
  ON public.lead_card_opens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own card opens"
  ON public.lead_card_opens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all card opens"
  ON public.lead_card_opens
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerentes can view company card opens"
  ON public.lead_card_opens
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND is_same_company(user_id)
  );