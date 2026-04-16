
-- Tabela de integrações SSótica (1 por loja)
CREATE TABLE public.ssotica_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  bearer_token text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  initial_sync_done boolean NOT NULL DEFAULT false,
  last_sync_vendas_at timestamptz,
  last_sync_receber_at timestamptz,
  sync_status text NOT NULL DEFAULT 'idle',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.ssotica_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ssotica_integrations"
ON public.ssotica_integrations
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_ssotica_integrations_updated_at
BEFORE UPDATE ON public.ssotica_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de logs de sync
CREATE TABLE public.ssotica_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.ssotica_integrations(id) ON DELETE CASCADE,
  sync_type text NOT NULL, -- 'vendas' | 'contas_receber' | 'full'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'error' | 'partial'
  items_processed integer NOT NULL DEFAULT 0,
  items_created integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  error_message text,
  details jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.ssotica_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ssotica_sync_logs"
ON public.ssotica_sync_logs
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_ssotica_sync_logs_integration_started
ON public.ssotica_sync_logs(integration_id, started_at DESC);

-- Adiciona colunas em crm_cobrancas
ALTER TABLE public.crm_cobrancas
  ADD COLUMN IF NOT EXISTS ssotica_parcela_id bigint,
  ADD COLUMN IF NOT EXISTS ssotica_titulo_id bigint,
  ADD COLUMN IF NOT EXISTS ssotica_cliente_id bigint,
  ADD COLUMN IF NOT EXISTS ssotica_company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS vencimento date,
  ADD COLUMN IF NOT EXISTS dias_atraso integer;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_cobrancas_ssotica_parcela
ON public.crm_cobrancas(ssotica_parcela_id)
WHERE ssotica_parcela_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_cobrancas_ssotica_company
ON public.crm_cobrancas(ssotica_company_id);

-- Adiciona colunas em crm_renovacoes
ALTER TABLE public.crm_renovacoes
  ADD COLUMN IF NOT EXISTS ssotica_cliente_id bigint,
  ADD COLUMN IF NOT EXISTS ssotica_venda_id bigint,
  ADD COLUMN IF NOT EXISTS ssotica_company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS data_ultima_compra date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_renovacoes_ssotica_cliente_company
ON public.crm_renovacoes(ssotica_cliente_id, ssotica_company_id)
WHERE ssotica_cliente_id IS NOT NULL AND ssotica_company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_renovacoes_ssotica_company
ON public.crm_renovacoes(ssotica_company_id);

-- Permite que crm_cobrancas e crm_renovacoes recebam INSERT pelo service_role
-- (a edge function vai usar service_role, então RLS não bloqueia, mas garantir created_by nullable lógica)
-- Já são nullable, ok.

-- Política adicional: permitir INSERT em crm_cobrancas vindo de integração (sem created_by user real)
-- Vamos manter created_by NULL nos inserts da integração; service_role bypassa RLS.

-- Política adicional para INSERT em crm_renovacoes via service_role
-- Service role bypassa RLS automaticamente. OK.
