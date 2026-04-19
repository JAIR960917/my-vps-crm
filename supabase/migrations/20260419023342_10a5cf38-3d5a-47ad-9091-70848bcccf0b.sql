-- Remove renovações criadas por engano via migração "cobranca_quitada"
-- Apenas as que NÃO têm data_ultima_compra (evidência de venda real) e estão em status "novo"
WITH wrong_renovacoes AS (
  SELECT id, ssotica_cliente_id, ssotica_company_id
  FROM public.crm_renovacoes
  WHERE data->>'origem_transicao' = 'cobranca_quitada'
    AND data_ultima_compra IS NULL
    AND status = 'novo'
)
DELETE FROM public.crm_module_transition_logs
WHERE from_module = 'cobranca'
  AND to_module = 'renovacao'
  AND target_record_id IN (SELECT id FROM wrong_renovacoes);

DELETE FROM public.crm_renovacoes
WHERE data->>'origem_transicao' = 'cobranca_quitada'
  AND data_ultima_compra IS NULL
  AND status = 'novo';