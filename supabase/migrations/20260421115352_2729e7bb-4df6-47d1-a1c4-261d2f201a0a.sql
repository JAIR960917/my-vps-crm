
-- Deduplicar parcelas_atrasadas mantendo a primeira ocorrência de cada parcela_id,
-- e recalcular valor e qtd_parcelas_atrasadas a partir do array dedup.
WITH parcelas_dedup AS (
  SELECT
    c.id AS cobranca_id,
    COALESCE(
      (
        SELECT jsonb_agg(p ORDER BY (p->>'vencimento'))
        FROM (
          SELECT DISTINCT ON (p->>'parcela_id') p
          FROM jsonb_array_elements(c.data->'parcelas_atrasadas') AS p
          ORDER BY p->>'parcela_id', p->>'vencimento'
        ) sub
      ),
      '[]'::jsonb
    ) AS parcelas_unicas
  FROM public.crm_cobrancas c
  WHERE jsonb_typeof(c.data->'parcelas_atrasadas') = 'array'
    AND jsonb_array_length(c.data->'parcelas_atrasadas') > 1
    AND c.status NOT IN ('pago', 'cancelado')
),
calculadas AS (
  SELECT
    pd.cobranca_id,
    pd.parcelas_unicas,
    jsonb_array_length(pd.parcelas_unicas) AS qtd,
    COALESCE((
      SELECT SUM((p->>'valor')::numeric)
      FROM jsonb_array_elements(pd.parcelas_unicas) p
    ), 0) AS total
  FROM parcelas_dedup pd
)
UPDATE public.crm_cobrancas c
SET
  data = jsonb_set(
    jsonb_set(
      jsonb_set(c.data, '{parcelas_atrasadas}', cal.parcelas_unicas, true),
      '{qtd_parcelas_atrasadas}', to_jsonb(cal.qtd), true
    ),
    '{total_atraso}', to_jsonb(cal.total), true
  ),
  valor = cal.total,
  updated_at = now()
FROM calculadas cal
WHERE c.id = cal.cobranca_id
  AND jsonb_array_length(c.data->'parcelas_atrasadas') <> cal.qtd;
