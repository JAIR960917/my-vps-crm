import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

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
    const { data: timeSetting } = await supabaseAdmin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "notification_time")
      .single();

    const notificationTime = timeSetting?.setting_value || "08:00";
    const [targetHour, targetMinute] = notificationTime.split(":").map(Number);

    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brMinute = now.getUTCMinutes();

    let forceRun = false;
    const url = new URL(req.url);
    if (url.searchParams.get("force") === "true") forceRun = true;
    if (!forceRun && req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.force === true) forceRun = true;
      } catch { /* empty body */ }
    }

    console.log(`Check: current=${brHour}:${String(brMinute).padStart(2, "0")}, target=${notificationTime}, force=${forceRun}`);

    if (!forceRun && (brHour !== targetHour || brMinute !== targetMinute)) {
      return new Response(JSON.stringify({
        message: "Não é o horário configurado",
        current: `${brHour}:${String(brMinute).padStart(2, "0")}`,
        target: notificationTime,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const brOffset = -3 * 60 * 60 * 1000;
    const brNow = new Date(now.getTime() + brOffset);
    const todayStart = new Date(Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), brNow.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const utcStart = new Date(todayStart.getTime() - brOffset).toISOString();
    const utcEnd = new Date(todayEnd.getTime() - brOffset).toISOString();

    const { data: scheduledLeads, error: leadsErr } = await supabaseAdmin
      .from("crm_leads")
      .select("id, data, assigned_to, scheduled_date")
      .not("scheduled_date", "is", null)
      .gte("scheduled_date", utcStart)
      .lt("scheduled_date", utcEnd);

    if (leadsErr) throw leadsErr;
    if (!scheduledLeads || scheduledLeads.length === 0) {
      console.log("No scheduled leads for today");
      return new Response(JSON.stringify({ message: "Nenhum lead agendado para hoje", notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${scheduledLeads.length} scheduled leads for today`);

    // Dedup: check if already notified today
    const scheduledMarker = "📅";
    if (!forceRun) {
      const todayStr = `${brNow.getUTCFullYear()}-${String(brNow.getUTCMonth() + 1).padStart(2, "0")}-${String(brNow.getUTCDate()).padStart(2, "0")}`;
      const { data: lastRunSetting } = await supabaseAdmin
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "last_scheduled_notification_date")
        .single();

      if (lastRunSetting?.setting_value === todayStr) {
        console.log("Already sent scheduled notification today");
        return new Response(JSON.stringify({ message: "Já notificado hoje", notified: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const leadsByUser: Record<string, typeof scheduledLeads> = {};
    for (const lead of scheduledLeads) {
      if (!lead.assigned_to) continue;
      if (!leadsByUser[lead.assigned_to]) leadsByUser[lead.assigned_to] = [];
      leadsByUser[lead.assigned_to].push(lead);
    }

    const vapidPublicKey = (Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
    const vapidPrivateKey = (Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();

    // Configure web-push with VAPID
    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(
        "mailto:noreply@crm.qualinetdigital.site",
        vapidPublicKey,
        vapidPrivateKey
      );
      console.log("web-push VAPID configured successfully");
    } else {
      console.warn("VAPID keys not configured - push notifications will not be sent");
    }

    let notifiedCount = 0;
    let pushSentCount = 0;
    let pushErrorCount = 0;

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

      const title = `${scheduledMarker} ${userLeads.length} lead(s) agendado(s) para hoje`;

      // Insert in-app notifications
      const notificationInserts = userLeads.map((lead, idx) => ({
        user_id: userId,
        title,
        message: leadNames[idx] || "Lead agendado",
        lead_id: lead.id,
      }));
      await supabaseAdmin.from("notifications").insert(notificationInserts);

      // Send native push notifications via web-push library
      if (vapidPublicKey && vapidPrivateKey) {
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", userId);

        console.log(`Found ${subs?.length || 0} push subscription(s) for user ${userId}`);

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({
            title,
            body: `Leads: ${leadNames.join(", ")}`,
            icon: "/pwa-192x192.png",
            badge: "/pwa-192x192.png",
            data: { url: "/" },
          });

          for (const sub of subs) {
            try {
              const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              };

              await webpush.sendNotification(pushSubscription, payload);
              pushSentCount++;
              console.log(`Push sent successfully to ${sub.endpoint.substring(0, 60)}`);
            } catch (pushErr: any) {
              pushErrorCount++;
              const statusCode = pushErr?.statusCode || pushErr?.status;
              const errMsg = pushErr?.message || String(pushErr);
              console.error(`Push error for ${sub.endpoint.substring(0, 60)}: [${statusCode}] ${errMsg}`);
              
              // Remove stale/expired subscriptions
              if (statusCode === 410 || statusCode === 404) {
                console.log("Removing stale subscription:", sub.endpoint.substring(0, 60));
                await supabaseAdmin
                  .from("push_subscriptions")
                  .delete()
                  .eq("endpoint", sub.endpoint);
              }
            }
          }
        }
      }
      notifiedCount++;
    }

    // Mark today as notified (only for scheduled runs)
    if (!forceRun) {
      const brNowForMark = new Date(now.getTime() + brOffset);
      const todayStr = `${brNowForMark.getUTCFullYear()}-${String(brNowForMark.getUTCMonth() + 1).padStart(2, "0")}-${String(brNowForMark.getUTCDate()).padStart(2, "0")}`;
      
      await supabaseAdmin.from("system_settings").upsert({
        setting_key: "last_scheduled_notification_date",
        setting_value: todayStr,
      }, { onConflict: "setting_key" });
    }

    console.log(`Notified ${notifiedCount} users, push sent: ${pushSentCount}, push errors: ${pushErrorCount}`);

    return new Response(JSON.stringify({ 
      message: "Notificações enviadas", 
      notified: notifiedCount,
      pushSent: pushSentCount,
      pushErrors: pushErrorCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Notification error:", err);
    return new Response(JSON.stringify({ error: "Falha ao enviar notificações" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
