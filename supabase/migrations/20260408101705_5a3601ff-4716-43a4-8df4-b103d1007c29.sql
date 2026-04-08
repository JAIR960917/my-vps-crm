
DROP POLICY "Authenticated can create notes" ON crm_lead_notes;

CREATE POLICY "Authenticated can create notes on accessible leads"
  ON crm_lead_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = crm_lead_notes.lead_id
        AND (
          l.assigned_to = auth.uid()
          OR l.created_by = auth.uid()
          OR has_role(auth.uid(), 'admin'::app_role)
          OR (has_role(auth.uid(), 'gerente'::app_role)
              AND (is_same_company(l.assigned_to) OR is_same_company(l.created_by)))
        )
    )
  );
