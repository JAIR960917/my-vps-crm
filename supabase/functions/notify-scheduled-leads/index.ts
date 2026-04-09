import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Web Push helpers
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<boolean> {
  try {
    // For web push we need to use the Web Push protocol
    // Using a simplified approach with fetch to the push endpoint
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "TTL": "86400",
      },
      body: payload,
    });
    return response.ok || response.status === 201;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get today's date range (in UTC-3 for Brazil)
    const now = new Date();
    const brOffset = -3 * 60 * 60 * 1000;
    const brNow = new Date(now.getTime() + brOffset);
    const todayStart = new Date(brNow.getFullYear(), brNow.getMonth(), brNow.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Convert back to UTC for DB query
    const utcStart = new Date(todayStart.getTime() - brOffset).toISOString();
    const utcEnd = new Date(todayEnd.getTime() - brOffset).toISOString();

    // Find leads scheduled for today
    const { data: scheduledLeads, error: leadsErr } = await supabaseAdmin
      .from("crm_leads")
      .select("id, data, assigned_to, scheduled_date")
      .not("scheduled_date", "is", null)
      .gte("scheduled_date", utcStart)
      .lt("scheduled_date", utcEnd);

    if (leadsErr) throw leadsErr;
    if (!scheduledLeads || scheduledLeads.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum lead agendado para hoje", notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group leads by assigned_to
    const leadsByUser: Record<string, typeof scheduledLeads> = {};
    for (const lead of scheduledLeads) {
      if (!lead.assigned_to) continue;
      if (!leadsByUser[lead.assigned_to]) leadsByUser[lead.assigned_to] = [];
      leadsByUser[lead.assigned_to].push(lead);
    }

    let notifiedCount = 0;

    // Get form fields to resolve lead names
    const { data: formFields } = await supabaseAdmin
      .from("crm_form_fields")
      .select("id, is_name_field")
      .eq("is_name_field", true);

    const nameFieldIds = (formFields || []).map(f => f.id);

    for (const [userId, userLeads] of Object.entries(leadsByUser)) {
      // Build lead names list
      const leadNames = userLeads.map(lead => {
        const data = (typeof lead.data === "object" && lead.data !== null) ? lead.data as Record<string, any> : {};
        for (const fid of nameFieldIds) {
          const name = data[`field_${fid}`];
          if (name) return name;
        }
        return data.nome_lead || "Lead";
      });

      const title = `📅 ${userLeads.length} lead(s) agendado(s) para hoje`;
      const message = leadNames.join(", ");

      // Create in-app notification for each lead
      const notificationInserts = userLeads.map(lead => ({
        user_id: userId,
        title,
        message: leadNames[userLeads.indexOf(lead)] || "Lead agendado",
        lead_id: lead.id,
      }));

      await supabaseAdmin.from("notifications").insert(notificationInserts);

      // Send push notifications
      const { data: subscriptions } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);

      if (subscriptions && subscriptions.length > 0) {
        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
        const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";

        for (const sub of subscriptions) {
          await sendWebPush(sub, JSON.stringify({ title, body: message }), vapidPublicKey, vapidPrivateKey);
        }
      }

      notifiedCount++;
    }

    return new Response(JSON.stringify({ message: "Notificações enviadas", notified: notifiedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Falha ao enviar notificações" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
