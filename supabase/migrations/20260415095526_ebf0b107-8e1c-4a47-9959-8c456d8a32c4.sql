ALTER TABLE public.crm_appointments ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE public.crm_appointments ALTER COLUMN lead_id SET DEFAULT NULL;