CREATE UNIQUE INDEX IF NOT EXISTS crm_cobrancas_one_per_client_idx 
ON public.crm_cobrancas (ssotica_company_id, ssotica_cliente_id) 
WHERE ssotica_company_id IS NOT NULL AND ssotica_cliente_id IS NOT NULL;