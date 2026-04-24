import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "crm_offline_lead_queue";
const APPT_QUEUE_KEY = "crm_offline_appointment_queue";

export type OfflineLead = {
  id: string;
  data: Record<string, any>;
  status: string;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  // Optional appointment to be created right after the lead is synced
  pending_appointment?: OfflineAppointmentPayload;
};

export type OfflineAppointmentPayload = {
  scheduled_datetime: string;
  scheduled_by: string;
  nome: string;
  telefone: string;
  valor: number;
  forma_pagamento: string;
  canal_agendamento: string;
  resumo?: string;
  previous_status: string;
};

export type OfflineAppointment = OfflineAppointmentPayload & {
  id: string;
  lead_id: string | null;
  // If lead_id is null, link by offline lead temp id so we can resolve after sync
  offline_lead_temp_id?: string;
  created_at: string;
};

export function getOfflineQueue(): OfflineLead[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToOfflineQueue(lead: OfflineLead) {
  const queue = getOfflineQueue();
  queue.push(lead);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function removeFromQueue(id: string) {
  const queue = getOfflineQueue().filter((l) => l.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getOfflineAppointmentQueue(): OfflineAppointment[] {
  try {
    return JSON.parse(localStorage.getItem(APPT_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToOfflineAppointmentQueue(appt: OfflineAppointment) {
  const queue = getOfflineAppointmentQueue();
  queue.push(appt);
  localStorage.setItem(APPT_QUEUE_KEY, JSON.stringify(queue));
}

function removeFromAppointmentQueue(id: string) {
  const queue = getOfflineAppointmentQueue().filter((a) => a.id !== id);
  localStorage.setItem(APPT_QUEUE_KEY, JSON.stringify(queue));
}

export async function syncOfflineQueue(): Promise<string[]> {
  const queue = getOfflineQueue();
  const apptQueue = getOfflineAppointmentQueue();
  const syncedIds: string[] = [];

  // 1) Sync leads first; if a lead has a pending appointment, create it after insert with the new lead.id
  for (const lead of queue) {
    const { data: inserted, error } = await supabase
      .from("crm_leads")
      .insert({
        data: lead.data,
        status: lead.status,
        assigned_to: lead.assigned_to,
        created_by: lead.created_by,
      })
      .select("id")
      .single();

    if (!error && inserted) {
      // Create attached appointment if any
      if (lead.pending_appointment) {
        const ap = lead.pending_appointment;
        await supabase.from("crm_appointments").insert({
          lead_id: inserted.id,
          scheduled_by: ap.scheduled_by,
          scheduled_datetime: ap.scheduled_datetime,
          nome: ap.nome,
          telefone: ap.telefone,
          valor: ap.valor,
          forma_pagamento: ap.forma_pagamento,
          canal_agendamento: ap.canal_agendamento,
          resumo: ap.resumo || "",
          previous_status: ap.previous_status,
        });
      }
      // Resolve any standalone offline appointments referencing this temp lead id
      const linked = apptQueue.filter((a) => a.offline_lead_temp_id === lead.id);
      for (const a of linked) {
        const { error: aErr } = await supabase.from("crm_appointments").insert({
          lead_id: inserted.id,
          scheduled_by: a.scheduled_by,
          scheduled_datetime: a.scheduled_datetime,
          nome: a.nome,
          telefone: a.telefone,
          valor: a.valor,
          forma_pagamento: a.forma_pagamento,
          canal_agendamento: a.canal_agendamento,
          resumo: a.resumo || "",
          previous_status: a.previous_status,
        });
        if (!aErr) removeFromAppointmentQueue(a.id);
      }

      removeFromQueue(lead.id);
      syncedIds.push(lead.id);
    }
  }

  // 2) Sync any standalone appointments that already have a real lead_id
  const remaining = getOfflineAppointmentQueue();
  for (const a of remaining) {
    if (!a.lead_id) continue;
    const { error } = await supabase.from("crm_appointments").insert({
      lead_id: a.lead_id,
      scheduled_by: a.scheduled_by,
      scheduled_datetime: a.scheduled_datetime,
      nome: a.nome,
      telefone: a.telefone,
      valor: a.valor,
      forma_pagamento: a.forma_pagamento,
      canal_agendamento: a.canal_agendamento,
      resumo: a.resumo || "",
      previous_status: a.previous_status,
    });
    if (!error) removeFromAppointmentQueue(a.id);
  }

  return syncedIds;
}
