ALTER TABLE public.crm_form_fields ADD COLUMN is_name_field boolean NOT NULL DEFAULT false;
ALTER TABLE public.crm_form_fields ADD COLUMN is_phone_field boolean NOT NULL DEFAULT false;