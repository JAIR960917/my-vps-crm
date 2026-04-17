-- 1. Move atividades dos órfãos (sem ssotica_cliente_id) para o card válido (com ssotica_cliente_id) do mesmo título
UPDATE public.cobranca_activities ca
SET cobranca_id = valid_card.id
FROM public.crm_cobrancas orphan
JOIN public.crm_cobrancas valid_card
  ON valid_card.ssotica_titulo_id = orphan.ssotica_titulo_id
  AND valid_card.ssotica_company_id = orphan.ssotica_company_id
  AND valid_card.ssotica_cliente_id IS NOT NULL
WHERE ca.cobranca_id = orphan.id
  AND orphan.ssotica_cliente_id IS NULL
  AND orphan.ssotica_titulo_id IS NOT NULL;

-- 2. Move comentários dos órfãos para o card válido
UPDATE public.crm_cobranca_notes cn
SET cobranca_id = valid_card.id
FROM public.crm_cobrancas orphan
JOIN public.crm_cobrancas valid_card
  ON valid_card.ssotica_titulo_id = orphan.ssotica_titulo_id
  AND valid_card.ssotica_company_id = orphan.ssotica_company_id
  AND valid_card.ssotica_cliente_id IS NOT NULL
WHERE cn.cobranca_id = orphan.id
  AND orphan.ssotica_cliente_id IS NULL
  AND orphan.ssotica_titulo_id IS NOT NULL;

-- 3. Remove os cards órfãos cuja contraparte válida existe
DELETE FROM public.crm_cobrancas orphan
USING public.crm_cobrancas valid_card
WHERE orphan.ssotica_cliente_id IS NULL
  AND orphan.ssotica_titulo_id IS NOT NULL
  AND valid_card.ssotica_titulo_id = orphan.ssotica_titulo_id
  AND valid_card.ssotica_company_id = orphan.ssotica_company_id
  AND valid_card.ssotica_cliente_id IS NOT NULL;

-- 4. Índice único para impedir duplicatas por título no futuro
CREATE UNIQUE INDEX IF NOT EXISTS crm_cobrancas_one_per_titulo_idx
ON public.crm_cobrancas (ssotica_company_id, ssotica_titulo_id)
WHERE ssotica_titulo_id IS NOT NULL;