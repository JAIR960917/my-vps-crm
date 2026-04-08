
CREATE TABLE public.crm_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options jsonb DEFAULT NULL,
  position integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  parent_field_id uuid REFERENCES public.crm_form_fields(id) ON DELETE CASCADE DEFAULT NULL,
  parent_trigger_value text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view form fields" ON public.crm_form_fields
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage form fields" ON public.crm_form_fields
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
