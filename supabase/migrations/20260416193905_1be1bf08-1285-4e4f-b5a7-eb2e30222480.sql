-- Replace insert policy: only admin or financeiro can create cobrancas
DROP POLICY IF EXISTS "Authenticated users can insert cobrancas" ON public.crm_cobrancas;

CREATE POLICY "Only admin or financeiro can insert cobrancas"
ON public.crm_cobrancas
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
);