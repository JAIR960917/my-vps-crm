DELETE FROM public.crm_cobrancas
WHERE ssotica_titulo_id IS NOT NULL
  AND lower(coalesce(data->'ssotica_raw'->>'situacao', '')) LIKE 'renegoc%';