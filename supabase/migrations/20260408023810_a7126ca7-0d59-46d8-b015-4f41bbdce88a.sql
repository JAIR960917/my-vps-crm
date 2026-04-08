
-- Fix 1: Prevent gerentes from inserting duplicate role entries
-- Drop and recreate the gerente INSERT policy with a check for existing roles
DROP POLICY IF EXISTS "Gerentes can insert vendedor roles" ON public.user_roles;
CREATE POLICY "Gerentes can insert vendedor roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'gerente'::app_role)
  AND is_same_company(user_id)
  AND role = 'vendedor'::app_role
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = user_roles.user_id
  )
);

-- Fix 2: Add explicit restrictive UPDATE policy for crm_lead_notes
-- Only note authors can edit their own notes
CREATE POLICY "Users can update own notes"
ON public.crm_lead_notes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
