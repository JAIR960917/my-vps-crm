import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get configured notification time
    const { data: timeSetting } = await supabaseAdmin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "notification_time")
      .single();

    const notificationTime = timeSetting?.setting_value || "08:00";
    const [targetHour, targetMinute] = notificationTime.split(":").map(Number);

    // Check if current time in Brazil (UTC-3) matches the configured time
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brMinute = now.getUTCMinutes();

    // Allow manual trigger via query param or body
    const url = new URL(req.url);
    let forceRun = url.searchParams.get("force") === "true";
    if (!forceRun && req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.force === true) forceRun = true;
      } catch { /* empty body is fine */ }
    }

    if (!forceRun && (brHour !== targetHour || brMinute !== targetMinute)) {
      return new Response(JSON.stringify({
        message: "Não é o horário configurado",
        current: `${brHour}:${String(brMinute).padStart(2, "0")}`,
        target: notificationTime,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get today's date range in Brazil timezone
    const brOffset = -3 * 60 * 60 * 1000;
    const brNow = new Date(now.getTime() + brOffset);
    const todayStart = new Date(Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), brNow.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

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

    // Check if already notified today (avoid duplicates)
    const { data: existingNotifs } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .gte("created_at", utcStart)
      .limit(1);

    if (existingNotifs && existingNotifs.length > 0 && !forceRun) {
      return new Response(JSON.stringify({ message: "Já notificado hoje", notified: 0 }), {
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

    const nameFieldIds = (formFields || []).map((f: { id: string }) => f.id);

    for (const [userId, userLeads] of Object.entries(leadsByUser)) {
      const leadNames = userLeads.map((lead) => {
        const data = (typeof lead.data === "object" && lead.data !== null) ? lead.data as Record<string, any> : {};
        for (const fid of nameFieldIds) {
          const name = data[`field_${fid}`];
          if (name) return String(name);
        }
        return data.nome_lead || "Lead";
      });

      const title = `📅 ${userLeads.length} lead(s) agendado(s) para hoje`;

      // Create in-app notification for each lead
      const notificationInserts = userLeads.map((lead, idx) => ({
        user_id: userId,
        title,
        message: leadNames[idx] || "Lead agendado",
        lead_id: lead.id,
      }));

      await supabaseAdmin.from("notifications").insert(notificationInserts);
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
