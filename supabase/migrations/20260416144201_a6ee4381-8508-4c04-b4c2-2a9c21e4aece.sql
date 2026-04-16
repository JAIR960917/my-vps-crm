
DROP POLICY "Authenticated users can insert cobrancas" ON public.crm_cobrancas;

CREATE POLICY "Authenticated users can insert cobrancas"
  ON public.crm_cobrancas FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
