-- Remove cobranças cuja parcela do SSótica foi renegociada
-- Detecta por dois critérios: campo situacao = "Renegociado" OU presença do objeto "renegociacao"
DELETE FROM public.crm_cobrancas
WHERE ssotica_titulo_id IS NOT NULL
  AND (
    lower(coalesce(data->'ssotica_raw'->>'situacao', '')) LIKE 'renegoc%'
    OR (
      data->'ssotica_raw'->'renegociacao' IS NOT NULL
      AND data->'ssotica_raw'->'renegociacao' != 'null'::jsonb
      AND jsonb_typeof(data->'ssotica_raw'->'renegociacao') = 'object'
      AND data->'ssotica_raw'->'renegociacao'->>'id' IS NOT NULL
    )
  );