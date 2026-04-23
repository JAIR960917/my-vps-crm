-- Recalcula dias_atraso baseado no vencimento usando data atual em São Paulo
WITH br_today AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
)
UPDATE crm_cobrancas c
SET 
  dias_atraso = (SELECT d FROM br_today) - c.vencimento,
  status = CASE
    WHEN ((SELECT d FROM br_today) - c.vencimento) <= -1 THEN 'pendente'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 0 AND 4 THEN 'em_cobranca'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 5 AND 14 THEN '5_dias_de_atraso'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 15 AND 29 THEN 'atrasado'
    WHEN ((SELECT d FROM br_today) - c.vencimento) = 30 THEN '30_dias_de_atraso'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 31 AND 44 THEN '31_dias_de_atraso_ligao'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 45 AND 59 THEN '45_dias_de_atrasomensagem_automtica'
    WHEN ((SELECT d FROM br_today) - c.vencimento) = 60 THEN '60_dias_de_atraso_ligao_negativao'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 61 AND 64 THEN '61_negativao'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 65 AND 74 THEN '65_dias_de_atraso_receber_informe_de_negativao'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 75 AND 89 THEN '75_dias_de_atraso_proposta_de_negociao_ps_negativao'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 90 AND 104 THEN '90_dias_de_atraso_ligao_para_tentativa_de_negociao_ps_negativao'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 105 AND 119 THEN '105_dias_de_atraso_notificao_extra_judicial_altomtico'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 120 AND 134 THEN '120_dias_de_atraso_ligao_informe_judicial'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 135 AND 149 THEN '135_dias_de_atraso_oferta_de_negativao_automatico'
    WHEN ((SELECT d FROM br_today) - c.vencimento) BETWEEN 150 AND 179 THEN '150_dias_de_atraso_enviar_para_o_advogado'
    ELSE '180_dias_ajuizar_manualmente'
  END,
  updated_at = now()
WHERE c.vencimento IS NOT NULL;