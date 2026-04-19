-- Limpa renovações de clientes que possuem cobrança ativa na mesma loja.
-- Esses cards estão em local errado (deveriam estar apenas em Cobrança) e serão
-- recriados pelo backfill apenas se o cliente realmente quitar a dívida.
WITH wrong_renovacoes AS (
  SELECT r.id, r.ssotica_cliente_id, r.ssotica_company_id, r.data
  FROM public.crm_renovacoes r
  WHERE r.ssotica_cliente_id IS NOT NULL
    AND r.ssotica_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.crm_cobrancas c
      WHERE c.ssotica_cliente_id = r.ssotica_cliente_id
        AND c.ssotica_company_id = r.ssotica_company_id
        AND c.status NOT IN ('pago', 'cancelado')
    )
)
INSERT INTO public.crm_module_transition_logs (
  cliente_nome, from_module, to_module, to_status_key, to_status_label,
  source_record_id, target_record_id, ssotica_cliente_id, company_id,
  triggered_by, trigger_source
)
SELECT
  COALESCE(wr.data->>'nome', 'Cliente SSótica'),
  'renovacao',
  'cobranca',
  NULL,
  NULL,
  wr.id,
  (SELECT c.id FROM public.crm_cobrancas c
    WHERE c.ssotica_cliente_id = wr.ssotica_cliente_id
      AND c.ssotica_company_id = wr.ssotica_company_id
    LIMIT 1),
  wr.ssotica_cliente_id,
  wr.ssotica_company_id,
  NULL,
  'auto_cleanup'
FROM wrong_renovacoes wr;

DELETE FROM public.crm_renovacoes r
WHERE r.ssotica_cliente_id IS NOT NULL
  AND r.ssotica_company_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.crm_cobrancas c
    WHERE c.ssotica_cliente_id = r.ssotica_cliente_id
      AND c.ssotica_company_id = r.ssotica_company_id
      AND c.status NOT IN ('pago', 'cancelado')
  );