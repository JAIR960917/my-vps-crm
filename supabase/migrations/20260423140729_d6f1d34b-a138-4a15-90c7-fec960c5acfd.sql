-- Remove duplicatas de cobranças por ssotica_cliente_id, mantendo a mais antiga
WITH ranked AS (
  SELECT id,
         ssotica_cliente_id,
         ROW_NUMBER() OVER (
           PARTITION BY ssotica_cliente_id
           ORDER BY vencimento ASC NULLS LAST, dias_atraso DESC NULLS LAST, created_at ASC
         ) AS rn
  FROM crm_cobrancas
  WHERE ssotica_cliente_id IS NOT NULL
)
DELETE FROM crm_cobrancas
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);