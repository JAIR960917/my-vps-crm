
-- Create efficient function that returns all user_ids in same company as caller
CREATE OR REPLACE FUNCTION public.get_company_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p2.user_id
  FROM profiles p1
  JOIN profiles p2 ON p1.company_id = p2.company_id
  WHERE p1.user_id = auth.uid()
    AND p1.company_id IS NOT NULL
  UNION
  SELECT p.user_id
  FROM manager_companies mc
  JOIN profiles p ON p.company_id = mc.company_id
  WHERE mc.user_id = auth.uid()
  UNION
  SELECT mc.user_id
  FROM profiles p
  JOIN manager_companies mc ON mc.company_id = p.company_id
  WHERE p.user_id = auth.uid()
    AND p.company_id IS NOT NULL
$$;

-- Drop and recreate the lead visibility policy using the efficient function
DROP POLICY IF EXISTS "Role-scoped lead visibility" ON public.crm_leads;

CREATE POLICY "Role-scoped lead visibility"
ON public.crm_leads
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR (
    has_role(auth.uid(), 'gerente'::app_role)
    AND (
      assigned_to IN (SELECT get_company_user_ids())
      OR created_by IN (SELECT get_company_user_ids())
    )
  )
);
