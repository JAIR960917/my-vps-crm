-- Reconciliação imediata: remove renovações de clientes com cobrança aberta em qualquer loja.
-- Registra a transição reversa para manter rastreabilidade.
WITH wrong_renovacoes AS (
  SELECT r.id, r.ssotica_cliente_id, r.ssotica_company_id, r.data,
         (SELECT c.id FROM public.crm_cobrancas c
            WHERE c.ssotica_cliente_id = r.ssotica_cliente_id
              AND c.ssotica_company_id = r.ssotica_company_id
              AND c.status NOT IN ('pago','cancelado')
            LIMIT 1) AS cob_id
  FROM public.crm_renovacoes r
  WHERE r.ssotica_cliente_id IS NOT NULL
    AND r.ssotica_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.crm_cobrancas c
      WHERE c.ssotica_cliente_id = r.ssotica_cliente_id
        AND c.ssotica_company_id = r.ssotica_company_id
        AND c.status NOT IN ('pago','cancelado')
    )
), logged AS (
  INSERT INTO public.crm_module_transition_logs (
    cliente_nome, from_module, to_module, to_status_key, to_status_label,
    source_record_id, target_record_id, ssotica_cliente_id, company_id,
    triggered_by, trigger_source
  )
  SELECT
    COALESCE(wr.data->>'nome','Cliente SSótica'),
    'renovacao','cobranca',NULL,NULL,
    wr.id, wr.cob_id, wr.ssotica_cliente_id, wr.ssotica_company_id,
    NULL,'auto_reconcile'
  FROM wrong_renovacoes wr
  RETURNING source_record_id
)
DELETE FROM public.crm_renovacoes r
WHERE r.id IN (SELECT source_record_id FROM logged);