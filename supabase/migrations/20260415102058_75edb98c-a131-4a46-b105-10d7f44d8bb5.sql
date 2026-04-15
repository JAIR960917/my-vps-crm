ALTER TABLE public.crm_appointments
  ADD COLUMN valor_venda numeric NOT NULL DEFAULT 0,
  ADD COLUMN forma_pagamento_venda text NOT NULL DEFAULT '';