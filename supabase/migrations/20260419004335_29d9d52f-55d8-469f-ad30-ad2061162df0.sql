-- Tabela de logs de movimentação entre Renovação e Cobrança
CREATE TABLE public.crm_module_transition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome text NOT NULL,
  from_module text NOT NULL, -- 'renovacao' | 'cobranca'
  to_module text NOT NULL,   -- 'renovacao' | 'cobranca'
  to_status_key text,        -- key da coluna de destino
  to_status_label text,      -- label da coluna de destino
  source_record_id uuid,     -- id do registro origem (renovacao ou cobranca)
  target_record_id uuid,     -- id do registro destino
  ssotica_cliente_id bigint,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  triggered_by uuid,         -- user_id se manual
  trigger_source text NOT NULL DEFAULT 'auto', -- 'auto' (ssotica) | 'manual'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_module_transition_logs_created_at ON public.crm_module_transition_logs(created_at DESC);
CREATE INDEX idx_module_transition_logs_company ON public.crm_module_transition_logs(company_id);
CREATE INDEX idx_module_transition_logs_from_to ON public.crm_module_transition_logs(from_module, to_module);

ALTER TABLE public.crm_module_transition_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view module transition logs"
ON public.crm_module_transition_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can insert module transition logs"
ON public.crm_module_transition_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can delete module transition logs"
ON public.crm_module_transition_logs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));