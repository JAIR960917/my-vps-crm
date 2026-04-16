
-- crm_cobrancas: permitir financeiro acesso total
DROP POLICY IF EXISTS "Users can view cobrancas from same company" ON public.crm_cobrancas;
CREATE POLICY "Users can view cobrancas"
ON public.crm_cobrancas FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR is_same_company(assigned_to)
  OR is_same_company(created_by)
  OR (assigned_to = auth.uid())
  OR (created_by = auth.uid())
);

DROP POLICY IF EXISTS "Authenticated users can insert cobrancas" ON public.crm_cobrancas;
CREATE POLICY "Authenticated users can insert cobrancas"
ON public.crm_cobrancas FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
);

DROP POLICY IF EXISTS "Users can update cobrancas" ON public.crm_cobrancas;
CREATE POLICY "Users can update cobrancas"
ON public.crm_cobrancas FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR (assigned_to = auth.uid())
  OR (created_by = auth.uid())
);

DROP POLICY IF EXISTS "Admins can delete cobrancas" ON public.crm_cobrancas;
CREATE POLICY "Admins can delete cobrancas"
ON public.crm_cobrancas FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
);
