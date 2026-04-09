-- Fix 1: Allow lead creators to update their own leads
CREATE POLICY "Creators can update own leads"
ON public.crm_leads
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- Fix 2: Prevent gerentes from inserting roles for themselves (role duplication)
DROP POLICY IF EXISTS "Gerentes can insert vendedor roles" ON public.user_roles;

CREATE POLICY "Gerentes can insert vendedor roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'gerente'::app_role)
  AND role = 'vendedor'::app_role
  AND user_roles.user_id <> auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = user_roles.user_id
  )
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.company_id IS NOT NULL
      AND p.company_id = get_my_company_id()
  )
);