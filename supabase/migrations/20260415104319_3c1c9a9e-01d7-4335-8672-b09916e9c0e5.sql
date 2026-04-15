
-- Drop the old vendedor SELECT policy (only own appointments)
DROP POLICY IF EXISTS "Vendedores can view own appointments" ON public.crm_appointments;

-- Create new policy: all authenticated users can view appointments from same company
CREATE POLICY "Users can view company appointments"
ON public.crm_appointments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR scheduled_by = auth.uid()
  OR is_same_company(scheduled_by)
);
