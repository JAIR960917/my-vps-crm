UPDATE public.crm_renovacoes r
SET status = CASE
  WHEN r.data_ultima_compra IS NULL THEN 'sem_data_compra'
  WHEN (CURRENT_DATE - r.data_ultima_compra::date) >= 730 THEN 'mais_2_anos'
  WHEN (CURRENT_DATE - r.data_ultima_compra::date) >= 365 THEN 'entre_1_2_anos'
  WHEN (CURRENT_DATE - r.data_ultima_compra::date) >= 180 THEN 'entre_6_12_meses'
  ELSE 'menos_6_meses'
END
WHERE r.status = 'fazer_direcionamento_para_o_vendedor'
  AND r.assigned_to IS NOT NULL;