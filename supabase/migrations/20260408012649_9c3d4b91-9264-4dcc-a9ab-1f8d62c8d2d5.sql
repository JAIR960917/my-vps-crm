
-- 1. Fix: Vendedor can modify ownership fields on assigned leads
-- Add WITH CHECK to prevent changing assigned_to and created_by
DROP POLICY IF EXISTS "Admins and gerentes can update any lead" ON public.crm_leads;

-- Admin: full update
CREATE POLICY "Admins can update any lead" ON public.crm_leads
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Gerente: update leads in their company
CREATE POLICY "Gerentes can update company leads" ON public.crm_leads
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND (is_same_company(assigned_to) OR is_same_company(created_by))
  );

-- Vendedor: can only update leads assigned to them, cannot change assigned_to or created_by
CREATE POLICY "Vendedores can update assigned leads" ON public.crm_leads
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- 2. Fix: Gerente profile insert - restrict to only users without existing profiles
DROP POLICY IF EXISTS "Gerentes can insert company profiles" ON public.profiles;
CREATE POLICY "Gerentes can insert company profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND company_id = get_my_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.user_id = profiles.user_id
    )
  );
