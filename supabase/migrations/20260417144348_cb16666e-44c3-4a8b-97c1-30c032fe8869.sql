-- Remove cards cujo vencimento é hoje ou no futuro (não estão em atraso)
DELETE FROM public.crm_cobrancas
WHERE vencimento IS NOT NULL
  AND vencimento >= CURRENT_DATE
  AND ssotica_titulo_id IS NOT NULL;

-- Remove cards sem atraso real (dias_atraso <= 0) vindos do SSótica
DELETE FROM public.crm_cobrancas
WHERE coalesce(dias_atraso, 0) <= 0
  AND ssotica_titulo_id IS NOT NULL;