-- Tabela de mapeamento manual: vendedor SSótica -> usuário CRM por empresa
CREATE TABLE public.ssotica_user_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ssotica_funcionario_id BIGINT NOT NULL,
  ssotica_funcionario_nome TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, ssotica_funcionario_id)
);

CREATE INDEX idx_ssotica_user_mappings_company ON public.ssotica_user_mappings(company_id);
CREATE INDEX idx_ssotica_user_mappings_user ON public.ssotica_user_mappings(user_id);

ALTER TABLE public.ssotica_user_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ssotica user mappings"
ON public.ssotica_user_mappings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view ssotica user mappings"
ON public.ssotica_user_mappings
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER update_ssotica_user_mappings_updated_at
BEFORE UPDATE ON public.ssotica_user_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Cache de funcionários conhecidos do SSótica (preenchido pelo sync), pra UI mostrar a lista
CREATE TABLE public.ssotica_funcionarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ssotica_funcionario_id BIGINT NOT NULL,
  nome TEXT NOT NULL,
  funcao TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, ssotica_funcionario_id)
);

CREATE INDEX idx_ssotica_funcionarios_company ON public.ssotica_funcionarios(company_id);

ALTER TABLE public.ssotica_funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ssotica funcionarios"
ON public.ssotica_funcionarios
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view ssotica funcionarios"
ON public.ssotica_funcionarios
FOR SELECT
TO authenticated
USING (true);