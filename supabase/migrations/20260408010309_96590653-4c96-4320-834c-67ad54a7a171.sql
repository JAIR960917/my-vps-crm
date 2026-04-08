
-- 1. Fix: Gerentes can update leads outside their company
DROP POLICY IF EXISTS "Admins and gerentes can update any lead" ON public.crm_leads;
CREATE POLICY "Admins and gerentes can update any lead" ON public.crm_leads
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (assigned_to = auth.uid())
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND (is_same_company(assigned_to) OR is_same_company(created_by))
    )
  );

-- 2. Fix: Gerentes role escalation - split into separate policies
DROP POLICY IF EXISTS "Gerentes can manage company roles" ON public.user_roles;

CREATE POLICY "Gerentes can view company roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(user_id)
  );

CREATE POLICY "Gerentes can insert vendedor roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND is_same_company(user_id)
    AND role = 'vendedor'::app_role
  );

CREATE POLICY "Gerentes can update to vendedor only" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND is_same_company(user_id)
    AND role = 'vendedor'::app_role
  )
  WITH CHECK (role = 'vendedor'::app_role);

CREATE POLICY "Gerentes can delete vendedor roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND is_same_company(user_id)
    AND role = 'vendedor'::app_role
  );

-- 3. Fix: Gerentes can insert profiles for any company
DROP POLICY IF EXISTS "Gerentes can insert company profiles" ON public.profiles;
CREATE POLICY "Gerentes can insert company profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND company_id = get_my_company_id()
  );
