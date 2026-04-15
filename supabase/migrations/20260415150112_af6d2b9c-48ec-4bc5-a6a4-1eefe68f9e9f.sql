-- Fix assigned_to FK to SET NULL on delete
ALTER TABLE public.crm_leads DROP CONSTRAINT crm_leads_assigned_to_fkey;
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_assigned_to_fkey 
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Fix created_by FK to SET NULL on delete  
ALTER TABLE public.crm_leads ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.crm_leads DROP CONSTRAINT crm_leads_created_by_fkey;
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;