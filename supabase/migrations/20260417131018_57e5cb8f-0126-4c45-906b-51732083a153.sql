-- Adiciona flag is_cpf_field no formulário de renovação
ALTER TABLE public.crm_renovacao_form_fields
ADD COLUMN IF NOT EXISTS is_cpf_field boolean NOT NULL DEFAULT false;

-- Marca o campo CPF existente automaticamente
UPDATE public.crm_renovacao_form_fields
SET is_cpf_field = true
WHERE lower(label) = 'cpf' AND is_cpf_field = false;

-- Marca o campo "Data da última consulta" como is_last_visit_field
UPDATE public.crm_renovacao_form_fields
SET is_last_visit_field = true
WHERE lower(label) LIKE '%última consulta%' OR lower(label) LIKE '%ultima consulta%' OR lower(label) LIKE '%última compra%' OR lower(label) LIKE '%ultima compra%';