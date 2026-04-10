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

    // Dedup: only block if we already sent a SCHEDULED notification today (not manual tests)
    // We use a specific title prefix marker to distinguish scheduled from force/test
    const scheduledMarker = "📅";
    if (!forceRun) {
      const { data: existingNotifs } = await supabaseAdmin
        .from("notifications")
        .select("id, title")
        .gte("created_at", utcStart)
        .like("title", `${scheduledMarker}%`)
        .limit(1);

      // Check if any of these were from a scheduled run (not force)
      // We'll use a system_settings key to track last scheduled run date
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

    let notifiedCount = 0;

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

      const notificationInserts = userLeads.map((lead, idx) => ({
        user_id: userId,
        title,
        message: leadNames[idx] || "Lead agendado",
        lead_id: lead.id,
      }));
      await supabaseAdmin.from("notifications").insert(notificationInserts);

      // Web Push
      if (vapidPublicKey && vapidPrivateKey) {
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", userId);

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
              await sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey);
              console.log("Push sent to", sub.endpoint.substring(0, 60));
            } catch (pushErr: any) {
              const errMsg = pushErr?.message || String(pushErr);
              console.error("Push send error for", sub.endpoint.substring(0, 60), ":", errMsg);
              // Remove stale/expired subscriptions (410 Gone or 404)
              if (errMsg.includes("410") || errMsg.includes("404")) {
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

    // Mark today as notified (only for scheduled runs, not force)
    if (!forceRun) {
      const brNowForMark = new Date(now.getTime() + brOffset);
      const todayStr = `${brNowForMark.getUTCFullYear()}-${String(brNowForMark.getUTCMonth() + 1).padStart(2, "0")}-${String(brNowForMark.getUTCDate()).padStart(2, "0")}`;
      
      await supabaseAdmin.from("system_settings").upsert({
        setting_key: "last_scheduled_notification_date",
        setting_value: todayStr,
      }, { onConflict: "setting_key" });
    }

    console.log(`Notified ${notifiedCount} users`);

    return new Response(JSON.stringify({ message: "Notificações enviadas", notified: notifiedCount }), {
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

// --- Web Push helpers ---

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
) {
  const endpointUrl = new URL(sub.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  const rawPublic = base64urlDecode(vapidPublicKey);
  
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: vapidPrivateKey,
    x: base64urlEncodeBytes(rawPublic.slice(1, 33)),
    y: base64urlEncodeBytes(rawPublic.slice(33, 65)),
  };

  const key = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = base64urlEncode(JSON.stringify({
    aud: audience,
    exp: nowSec + 86400,
    sub: "mailto:noreply@crm.qualinetdigital.site",
  }));
  const unsigned = new TextEncoder().encode(`${header}.${body}`);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, unsigned
  );
  const rawSig = derToRaw(new Uint8Array(sig));
  const vapidToken = `${header}.${body}.${base64urlEncodeBytes(rawSig)}`;

  const encrypted = await encryptPayload(sub.p256dh, sub.auth, payload);

  const response = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
      "Authorization": `vapid t=${vapidToken}, k=${vapidPublicKey}`,
    },
    body: encrypted,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Push failed ${response.status}: ${text}`);
  }
  await response.text();
}

async function encryptPayload(
  p256dhBase64: string,
  authBase64: string,
  payload: string,
): Promise<Uint8Array> {
  const p256dhBytes = base64urlDecode(p256dhBase64);
  const authBytes = base64urlDecode(authBase64);
  const payloadBytes = new TextEncoder().encode(payload);

  const localKey = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const subscriberKey = await crypto.subtle.importKey(
    "raw", p256dhBytes, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberKey }, localKey.privateKey, 256,
    ),
  );

  const localPubKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKey.publicKey),
  );

  const authInfo = new TextEncoder().encode("WebPush: info\0");
  const authInfoFull = new Uint8Array(authInfo.length + p256dhBytes.length + localPubKey.length);
  authInfoFull.set(authInfo);
  authInfoFull.set(p256dhBytes, authInfo.length);
  authInfoFull.set(localPubKey, authInfo.length + p256dhBytes.length);

  const ikm = await hkdf(authBytes, sharedSecret, authInfoFull, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2;

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, paddedPayload),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, payloadBytes.length + 1 + 16 + 1);
  const headerBytes = new Uint8Array(16 + 4 + 1 + localPubKey.length);
  headerBytes.set(salt);
  headerBytes.set(rs, 16);
  headerBytes[20] = localPubKey.length;
  headerBytes.set(localPubKey, 21);

  const result = new Uint8Array(headerBytes.length + encrypted.length);
  result.set(headerBytes);
  result.set(encrypted, headerBytes.length);
  return result;
}

async function hkdf(
  salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number,
): Promise<Uint8Array> {
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC",
    await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    ikm,
  ));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  return okm.slice(0, length);
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function derToRaw(der: Uint8Array): Uint8Array {
  if (der.length === 64) return der;
  const raw = new Uint8Array(64);
  let offset = 2;
  const rLen = der[offset + 1];
  offset += 2;
  const rStart = rLen > 32 ? offset + (rLen - 32) : offset;
  const rDest = rLen < 32 ? 32 - rLen : 0;
  raw.set(der.slice(rStart, offset + rLen), rDest);
  offset += rLen;
  const sLen = der[offset + 1];
  offset += 2;
  const sStart = sLen > 32 ? offset + (sLen - 32) : offset;
  const sDest = sLen < 32 ? 64 - sLen : 32;
  raw.set(der.slice(sStart, offset + sLen), sDest);
  return raw;
}