-- Create manager_companies junction table
CREATE TABLE public.manager_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.manager_companies ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins full access on manager_companies"
  ON public.manager_companies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Gerentes can view own associations
CREATE POLICY "Gerentes can view own manager_companies"
  ON public.manager_companies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Update is_same_company to also check manager_companies
CREATE OR REPLACE FUNCTION public.is_same_company(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Original check: both users share a company_id in profiles
    SELECT 1 FROM public.profiles p1
    JOIN public.profiles p2 ON p1.company_id = p2.company_id
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = _user_id
      AND p1.company_id IS NOT NULL

    UNION ALL

    -- Caller is a manager with extra companies that match target's profile company
    SELECT 1 FROM public.manager_companies mc
    JOIN public.profiles p ON p.company_id = mc.company_id
    WHERE mc.user_id = auth.uid()
      AND p.user_id = _user_id

    UNION ALL

    -- Target is a manager with extra companies that match caller's profile company
    SELECT 1 FROM public.manager_companies mc
    JOIN public.profiles p ON p.company_id = mc.company_id
    WHERE mc.user_id = _user_id
      AND p.user_id = auth.uid()

    UNION ALL

    -- Both are managers sharing an extra company
    SELECT 1 FROM public.manager_companies mc1
    JOIN public.manager_companies mc2 ON mc1.company_id = mc2.company_id
    WHERE mc1.user_id = auth.uid()
      AND mc2.user_id = _user_id
  );
$$;