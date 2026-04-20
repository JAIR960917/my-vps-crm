-- ssotica_funcionarios
DROP POLICY IF EXISTS "Authenticated can view ssotica funcionarios" ON public.ssotica_funcionarios;
CREATE POLICY "View ssotica funcionarios scoped"
ON public.ssotica_funcionarios
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_my_company(company_id));

-- ssotica_user_mappings
DROP POLICY IF EXISTS "Authenticated can view ssotica user mappings" ON public.ssotica_user_mappings;
CREATE POLICY "View ssotica user mappings scoped"
ON public.ssotica_user_mappings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_my_company(company_id)
  OR user_id = auth.uid()
);

-- whatsapp_campaigns
DROP POLICY IF EXISTS "Vendedores can view campaigns" ON public.whatsapp_campaigns;
CREATE POLICY "View whatsapp campaigns scoped"
ON public.whatsapp_campaigns
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR (company_id IS NOT NULL AND is_my_company(company_id))
  OR is_same_company(created_by)
);

-- whatsapp_trigger_campaigns
DROP POLICY IF EXISTS "Vendedores can view trigger campaigns" ON public.whatsapp_trigger_campaigns;
CREATE POLICY "View whatsapp trigger campaigns scoped"
ON public.whatsapp_trigger_campaigns
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR (company_id IS NOT NULL AND is_my_company(company_id))
  OR is_same_company(created_by)
);

-- whatsapp_trigger_steps
DROP POLICY IF EXISTS "Vendedores can view trigger steps" ON public.whatsapp_trigger_steps;
CREATE POLICY "View whatsapp trigger steps scoped"
ON public.whatsapp_trigger_steps
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.whatsapp_trigger_campaigns c
    WHERE c.id = whatsapp_trigger_steps.campaign_id
      AND (
        c.created_by = auth.uid()
        OR (c.company_id IS NOT NULL AND is_my_company(c.company_id))
        OR is_same_company(c.created_by)
      )
  )
);