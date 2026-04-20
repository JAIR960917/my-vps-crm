DROP POLICY IF EXISTS "update activities" ON public.renovacao_activities;

CREATE POLICY "Update own renovacao activities or admin"
ON public.renovacao_activities
FOR UPDATE
TO authenticated
USING ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));