
CREATE TABLE public.renovacao_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  renovacao_id uuid NOT NULL REFERENCES public.crm_renovacoes(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  scheduled_date timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.crm_renovacao_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  renovacao_id uuid NOT NULL REFERENCES public.crm_renovacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.renovacao_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_renovacao_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_renovacao(_renovacao_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_renovacoes r
    WHERE r.id = _renovacao_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR r.assigned_to = auth.uid()
        OR r.created_by = auth.uid()
        OR (r.ssotica_company_id IS NOT NULL AND public.is_my_company(r.ssotica_company_id))
      )
  );
$$;

CREATE POLICY "view activities" ON public.renovacao_activities FOR SELECT TO authenticated
  USING (public.can_access_renovacao(renovacao_id));
CREATE POLICY "insert activities" ON public.renovacao_activities FOR INSERT TO authenticated
  WITH CHECK (public.can_access_renovacao(renovacao_id) AND created_by = auth.uid());
CREATE POLICY "update activities" ON public.renovacao_activities FOR UPDATE TO authenticated
  USING (public.can_access_renovacao(renovacao_id));
CREATE POLICY "delete activities" ON public.renovacao_activities FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "view notes" ON public.crm_renovacao_notes FOR SELECT TO authenticated
  USING (public.can_access_renovacao(renovacao_id));
CREATE POLICY "insert notes" ON public.crm_renovacao_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_access_renovacao(renovacao_id) AND user_id = auth.uid());
CREATE POLICY "delete notes" ON public.crm_renovacao_notes FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.set_updated_at_renovacao_activities()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER renovacao_activities_updated_at BEFORE UPDATE ON public.renovacao_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_renovacao_activities();
