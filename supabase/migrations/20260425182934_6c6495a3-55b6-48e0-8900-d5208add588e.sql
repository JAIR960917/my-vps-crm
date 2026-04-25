-- ============================================================================
-- WHATSAPP TRIGGER CAMPAIGNS — gerente só vê os da própria empresa
-- ============================================================================
DROP POLICY IF EXISTS "View whatsapp trigger campaigns scoped" ON public.whatsapp_trigger_campaigns;
DROP POLICY IF EXISTS "Gerentes can manage company trigger campaigns" ON public.whatsapp_trigger_campaigns;

CREATE POLICY "View whatsapp trigger campaigns scoped"
ON public.whatsapp_trigger_campaigns
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND is_my_company(company_id)
  )
);

CREATE POLICY "Gerentes can manage company trigger campaigns"
ON public.whatsapp_trigger_campaigns
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'gerente'::app_role)
  AND company_id IS NOT NULL
  AND is_my_company(company_id)
)
WITH CHECK (
  has_role(auth.uid(), 'gerente'::app_role)
  AND auth.uid() = created_by
  AND company_id IS NOT NULL
  AND is_my_company(company_id)
);

-- ============================================================================
-- WHATSAPP CAMPAIGNS — gerente só vê os da própria empresa
-- ============================================================================
DROP POLICY IF EXISTS "View whatsapp campaigns scoped" ON public.whatsapp_campaigns;
DROP POLICY IF EXISTS "Gerentes can manage company campaigns" ON public.whatsapp_campaigns;

CREATE POLICY "View whatsapp campaigns scoped"
ON public.whatsapp_campaigns
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND is_my_company(company_id)
  )
);

CREATE POLICY "Gerentes can manage company campaigns"
ON public.whatsapp_campaigns
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'gerente'::app_role)
  AND company_id IS NOT NULL
  AND is_my_company(company_id)
)
WITH CHECK (
  has_role(auth.uid(), 'gerente'::app_role)
  AND auth.uid() = created_by
  AND company_id IS NOT NULL
  AND is_my_company(company_id)
);

-- ============================================================================
-- WHATSAPP TRIGGER SENDS — herda visibilidade do gatilho-pai
-- ============================================================================
DROP POLICY IF EXISTS "Scoped trigger sends visibility" ON public.whatsapp_trigger_sends;

CREATE POLICY "Scoped trigger sends visibility"
ON public.whatsapp_trigger_sends
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.whatsapp_trigger_campaigns c
    WHERE c.id = whatsapp_trigger_sends.campaign_id
      AND has_role(auth.uid(), 'gerente'::app_role)
      AND c.company_id IS NOT NULL
      AND is_my_company(c.company_id)
  )
);

-- ============================================================================
-- WHATSAPP CAMPAIGN SENDS — herda visibilidade da campanha-pai
-- ============================================================================
DROP POLICY IF EXISTS "Scoped campaign sends visibility" ON public.whatsapp_campaign_sends;

CREATE POLICY "Scoped campaign sends visibility"
ON public.whatsapp_campaign_sends
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.whatsapp_campaigns c
    WHERE c.id = whatsapp_campaign_sends.campaign_id
      AND has_role(auth.uid(), 'gerente'::app_role)
      AND c.company_id IS NOT NULL
      AND is_my_company(c.company_id)
  )
);