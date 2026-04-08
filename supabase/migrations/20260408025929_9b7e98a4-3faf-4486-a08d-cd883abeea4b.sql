
-- Fix 1: Tighten gerente INSERT policy on user_roles
-- Replace is_same_company with direct company_id check
DROP POLICY IF EXISTS "Gerentes can insert vendedor roles" ON public.user_roles;
CREATE POLICY "Gerentes can insert vendedor roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'gerente'::app_role)
  AND role = 'vendedor'::app_role
  AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = user_roles.user_id)
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.company_id IS NOT NULL
      AND p.company_id = get_my_company_id()
  )
);

-- Fix 2: Add WITH CHECK to gerentes lead update policy
DROP POLICY IF EXISTS "Gerentes can update company leads" ON public.crm_leads;
CREATE POLICY "Gerentes can update company leads"
ON public.crm_leads
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'gerente'::app_role)
  AND (is_same_company(assigned_to) OR is_same_company(created_by))
)
WITH CHECK (
  has_role(auth.uid(), 'gerente'::app_role)
  AND (assigned_to IS NULL OR is_same_company(assigned_to))
);
