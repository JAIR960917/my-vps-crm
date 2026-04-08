
-- Helper: get the calling user's company_id
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper: check if a given user_id is in the same company as the caller
CREATE OR REPLACE FUNCTION public.is_same_company(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p1
    JOIN public.profiles p2 ON p1.company_id = p2.company_id
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = _user_id
      AND p1.company_id IS NOT NULL
  );
$$;

-- ============ crm_leads ============
-- Drop old SELECT policy
DROP POLICY IF EXISTS "All can view leads" ON public.crm_leads;

-- Vendedor: own leads only; Gerente: leads of users in their company; Admin: all
CREATE POLICY "Role-scoped lead visibility"
  ON public.crm_leads FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (assigned_to = auth.uid())
    OR (created_by = auth.uid())
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND (
        is_same_company(assigned_to)
        OR is_same_company(created_by)
      )
    )
  );

-- ============ crm_lead_notes ============
DROP POLICY IF EXISTS "All authenticated can view notes" ON public.crm_lead_notes;

CREATE POLICY "Role-scoped note visibility"
  ON public.crm_lead_notes FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id
      AND (
        l.assigned_to = auth.uid()
        OR l.created_by = auth.uid()
        OR (
          has_role(auth.uid(), 'gerente'::app_role)
          AND (is_same_company(l.assigned_to) OR is_same_company(l.created_by))
        )
      )
    )
  );

-- ============ profiles ============
-- Drop old restricted policy and create new one including gerente company scope
DROP POLICY IF EXISTS "Users can view own or admin view all profiles" ON public.profiles;

CREATE POLICY "Scoped profile visibility"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND company_id IS NOT NULL
      AND company_id = get_my_company_id()
    )
  );

-- Allow gerentes to update profiles in their company
CREATE POLICY "Gerentes can update company profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND company_id = get_my_company_id()
  );

-- Allow gerentes to insert profiles (for user creation)
CREATE POLICY "Gerentes can insert company profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
  );

-- Allow gerentes to delete profiles in their company
CREATE POLICY "Gerentes can delete company profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND company_id = get_my_company_id()
  );

-- ============ user_roles ============
-- Drop old SELECT and create scoped one
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Scoped role visibility"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND is_same_company(user_id)
    )
  );

-- Allow gerentes to manage roles for users in their company
CREATE POLICY "Gerentes can manage company roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND is_same_company(user_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND is_same_company(user_id)
    AND role != 'admin'::app_role
  );
