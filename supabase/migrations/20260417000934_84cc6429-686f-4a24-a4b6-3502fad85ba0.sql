-- Tabela para configuração própria do formulário de Renovação
CREATE TABLE public.crm_renovacao_form_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  options JSONB NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_name_field BOOLEAN NOT NULL DEFAULT false,
  is_phone_field BOOLEAN NOT NULL DEFAULT false,
  is_last_visit_field BOOLEAN NOT NULL DEFAULT false,
  show_on_card BOOLEAN NOT NULL DEFAULT false,
  parent_field_id UUID NULL REFERENCES public.crm_renovacao_form_fields(id) ON DELETE SET NULL,
  parent_trigger_value TEXT NULL,
  status_mapping JSONB NULL,
  date_status_ranges JSONB NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_renovacao_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view renovacao form fields"
ON public.crm_renovacao_form_fields
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage renovacao form fields"
ON public.crm_renovacao_form_fields
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Campos padrão iniciais
INSERT INTO public.crm_renovacao_form_fields (label, field_type, position, is_required, is_name_field, show_on_card)
VALUES ('Nome', 'text', 0, true, true, true);

INSERT INTO public.crm_renovacao_form_fields (label, field_type, position, is_required, is_phone_field, show_on_card)
VALUES ('Telefone', 'phone', 1, false, true, true);

INSERT INTO public.crm_renovacao_form_fields (label, field_type, position, is_required, is_last_visit_field, show_on_card)
VALUES ('Data da última consulta', 'date', 2, true, false, true);
