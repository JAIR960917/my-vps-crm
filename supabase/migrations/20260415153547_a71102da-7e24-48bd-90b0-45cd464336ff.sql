
-- Helper function: check if a company_id belongs to the caller (primary or extra)
CREATE OR REPLACE FUNCTION public.is_my_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Primary company
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND company_id = _company_id
    UNION ALL
    -- Extra companies via manager_companies
    SELECT 1 FROM public.manager_companies
    WHERE user_id = auth.uid() AND company_id = _company_id
  );
$$;

-- Fix: Scoped profile visibility - gerentes see profiles from ALL their companies
DROP POLICY IF EXISTS "Scoped profile visibility" ON public.profiles;
CREATE POLICY "Scoped profile visibility"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND company_id IS NOT NULL
      AND is_my_company(company_id)
    )
  );

-- Fix: Gerentes can update company profiles
DROP POLICY IF EXISTS "Gerentes can update company profiles" ON public.profiles;
CREATE POLICY "Gerentes can update company profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND is_my_company(company_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND is_my_company(company_id)
  );

-- Fix: Gerentes can delete company profiles
DROP POLICY IF EXISTS "Gerentes can delete company profiles" ON public.profiles;
CREATE POLICY "Gerentes can delete company profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND is_my_company(company_id)
  );

-- Fix: Gerentes can insert company profiles
DROP POLICY IF EXISTS "Gerentes can insert company profiles" ON public.profiles;
CREATE POLICY "Gerentes can insert company profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND company_id IS NOT NULL
    AND is_my_company(company_id)
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = profiles.user_id)
  );

-- Fix: user_roles visibility for gerentes (uses is_same_company which is already fixed)
-- No change needed there.

-- Fix: Gerentes can view company roles - already uses is_same_company, OK.
