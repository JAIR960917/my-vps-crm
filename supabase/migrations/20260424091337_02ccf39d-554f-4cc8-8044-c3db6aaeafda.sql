CREATE POLICY "Vendedores can delete own appointments"
ON public.crm_appointments
FOR DELETE
TO authenticated
USING (scheduled_by = auth.uid());