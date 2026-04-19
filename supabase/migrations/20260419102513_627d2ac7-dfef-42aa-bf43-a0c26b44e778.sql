-- Remove renovações criadas erroneamente quando o sync achou que a cobrança foi quitada
-- mas na verdade a parcela apenas saiu da janela/paginação da API.
-- O próximo backfill/sync recriará as cobranças corretas.
WITH wrong AS (
  SELECT id, ssotica_cliente_id, ssotica_company_id, data->>'nome' as nome
  FROM public.crm_renovacoes
  WHERE data->>'origem_transicao' = 'cobranca_quitada'
    AND ssotica_cliente_id IS NOT NULL
), logged AS (
  INSERT INTO public.crm_module_transition_logs (
    cliente_nome, from_module, to_module, to_status_key, to_status_label,
    source_record_id, target_record_id, ssotica_cliente_id, company_id,
    triggered_by, trigger_source
  )
  SELECT COALESCE(w.nome, 'Cliente SSótica'),
         'renovacao', 'cobranca', NULL, NULL,
         w.id, NULL, w.ssotica_cliente_id, w.ssotica_company_id,
         NULL, 'auto_cleanup_falso_positivo'
  FROM wrong w
  RETURNING source_record_id
)
DELETE FROM public.crm_renovacoes WHERE id IN (SELECT source_record_id FROM logged);