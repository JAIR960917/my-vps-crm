
-- Add 'module' column to identify which page (leads/cobrancas/renovacoes) the campaign targets
ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'leads';

ALTER TABLE public.whatsapp_trigger_campaigns
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'leads';

-- Restrict allowed values
ALTER TABLE public.whatsapp_campaigns
  DROP CONSTRAINT IF EXISTS whatsapp_campaigns_module_check;
ALTER TABLE public.whatsapp_campaigns
  ADD CONSTRAINT whatsapp_campaigns_module_check
  CHECK (module IN ('leads', 'cobrancas', 'renovacoes'));

ALTER TABLE public.whatsapp_trigger_campaigns
  DROP CONSTRAINT IF EXISTS whatsapp_trigger_campaigns_module_check;
ALTER TABLE public.whatsapp_trigger_campaigns
  ADD CONSTRAINT whatsapp_trigger_campaigns_module_check
  CHECK (module IN ('leads', 'cobrancas', 'renovacoes'));

-- Pause all existing campaigns so admin must reconfirm the module before re-enabling
UPDATE public.whatsapp_campaigns SET is_active = false;
UPDATE public.whatsapp_trigger_campaigns SET is_active = false;
