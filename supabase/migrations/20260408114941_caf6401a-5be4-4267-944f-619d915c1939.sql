
-- Fix: Prevent gerentes from modifying company_id when updating profiles
-- Replace the current policy with one that adds a WITH CHECK preventing company_id changes

DROP POLICY IF EXISTS "Gerentes can update company profiles" ON profiles;

CREATE POLICY "Gerentes can update company profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND company_id = get_my_company_id()
  )
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND company_id = get_my_company_id()
  );
