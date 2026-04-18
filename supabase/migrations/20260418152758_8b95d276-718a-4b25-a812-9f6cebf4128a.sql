-- Add start_time/end_time and remove daily_limit on campaigns
ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS end_time time NOT NULL DEFAULT '18:00';

ALTER TABLE public.whatsapp_campaigns DROP COLUMN IF EXISTS daily_limit;

ALTER TABLE public.whatsapp_trigger_campaigns
  ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS end_time time NOT NULL DEFAULT '18:00';

ALTER TABLE public.whatsapp_trigger_campaigns DROP COLUMN IF EXISTS daily_limit;