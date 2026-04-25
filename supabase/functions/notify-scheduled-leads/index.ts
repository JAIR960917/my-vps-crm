import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import webpush from "https://esm.sh/web-push@3.6.7";

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

    // Calculate today's range in BR timezone
    const brOffset = -3 * 60 * 60 * 1000;
    const brNow = new Date(now.getTime() + brOffset);
    const todayStart = new Date(Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), brNow.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const utcStart = new Date(todayStart.getTime() - brOffset).toISOString();
    const utcEnd = new Date(todayEnd.getTime() - brOffset).toISOString();

    // Query crm_appointments for today's active appointments
    const { data: todayAppointments, error: apptsErr } = await supabaseAdmin
      .from("crm_appointments")
      .select("id, nome, telefone, scheduled_by, scheduled_datetime, lead_id")
      .eq("status", "agendado")
      .gte("scheduled_datetime", utcStart)
      .lt("scheduled_datetime", utcEnd);

    if (apptsErr) throw apptsErr;
    if (!todayAppointments || todayAppointments.length === 0) {
      console.log("No appointments for today");
      return new Response(JSON.stringify({ message: "Nenhum agendamento para hoje", notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${todayAppointments.length} appointments for today`);

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

    // Group appointments by scheduled_by user
    const apptsByUser: Record<string, typeof todayAppointments> = {};
    for (const appt of todayAppointments) {
      if (!appt.scheduled_by) continue;
      if (!apptsByUser[appt.scheduled_by]) apptsByUser[appt.scheduled_by] = [];
      apptsByUser[appt.scheduled_by].push(appt);
    }

    const vapidPublicKey = (Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
    const vapidPrivateKey = (Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();

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

    for (const [userId, userAppts] of Object.entries(apptsByUser)) {
      const apptNames = userAppts.map((a) => a.nome || "Cliente");

      const title = `${scheduledMarker} ${userAppts.length} agendamento(s) para hoje`;

      // Insert in-app notifications
      const notificationInserts = userAppts.map((appt, idx) => ({
        user_id: userId,
        title,
        message: apptNames[idx] || "Agendamento",
        lead_id: appt.lead_id || null,
      }));
      await supabaseAdmin.from("notifications").insert(notificationInserts);

      // Send native push notifications
      if (vapidPublicKey && vapidPrivateKey) {
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", userId);

        console.log(`Found ${subs?.length || 0} push subscription(s) for user ${userId}`);

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({
            title,
            body: `Clientes: ${apptNames.join(", ")}`,
            icon: "/pwa-192x192.png",
            badge: "/pwa-192x192.png",
            data: { url: "/agendamentos" },
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

    // Mark today as notified
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
