import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "crm_offline_lead_queue";

export type OfflineLead = {
  id: string;
  data: Record<string, any>;
  status: string;
  assigned_to: string | null;
  created_by: string;
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

export async function syncOfflineQueue(): Promise<number> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  for (const lead of queue) {
    const { error } = await supabase.from("crm_leads").insert({
      data: lead.data,
      status: lead.status,
      assigned_to: lead.assigned_to,
      created_by: lead.created_by,
    });
    if (!error) {
      removeFromQueue(lead.id);
      synced++;
    }
  }
  return synced;
}

// Auto-sync when coming back online
if (typeof window !== "undefined") {
  window.addEventListener("online", async () => {
    const synced = await syncOfflineQueue();
    if (synced > 0) {
      console.log(`[CRM] Synced ${synced} offline leads`);
    }
  });
}
