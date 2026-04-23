UPDATE public.crm_renovacoes
SET status = CASE
  WHEN data_ultima_compra IS NULL THEN 'novo'
  WHEN (CURRENT_DATE - data_ultima_compra) < 365 THEN 'em_contato'
  WHEN (CURRENT_DATE - data_ultima_compra) < 730 THEN 'agendado'
  WHEN (CURRENT_DATE - data_ultima_compra) < 1095 THEN 'renovado'
  ELSE 'mais_de_3_anos'
END
WHERE status = 'fazer_direcionamento_para_o_vendedor'
  AND assigned_to IS NOT NULL;