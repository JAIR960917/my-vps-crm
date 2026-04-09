import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SignJWT, importJWK } from "https://deno.land/x/jose@v5.2.2/index.ts";

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
      return new Response(JSON.stringify({ message: "Nenhum lead agendado para hoje", notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!forceRun) {
      const { data: existingNotifs } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .gte("created_at", utcStart)
        .limit(1);
      if (existingNotifs && existingNotifs.length > 0) {
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

    // Use the same public key hardcoded in the client
    const vapidPublicKey = "BL141X_o9G17ebARe4RvrsfOdXjL6pmMcSfCPSGB-xp7Mkn-HYIJwYgOo9txC80GGU-G9PzfKZDsHh5OEzrP_Ac";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";

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
            data: { url: "/leads" },
          });

          for (const sub of subs) {
            try {
              await sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey);
              console.log("Push sent to", sub.endpoint.substring(0, 60));
            } catch (pushErr) {
              console.error("Push send error:", pushErr);
            }
          }
        }
      }
      notifiedCount++;
    }

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

// --- Web Push helpers using jose ---

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
) {
  const endpointUrl = new URL(sub.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  // Import VAPID private key as JWK for ES256
  const rawPrivate = base64urlDecode(vapidPrivateKey);
  const rawPublic = base64urlDecode(vapidPublicKey);

  // Build JWK from raw keys
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: vapidPrivateKey, // already base64url
    x: base64urlEncodeBytes(rawPublic.slice(1, 33)),
    y: base64urlEncodeBytes(rawPublic.slice(33, 65)),
  };

  const key = await importJWK(jwk, "ES256");

  const vapidToken = await new SignJWT({ aud: audience, sub: "mailto:noreply@crm.qualinetdigital.site" })
    .setProtectedHeader({ typ: "JWT", alg: "ES256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);

  // Encrypt payload
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
  const header = new Uint8Array(16 + 4 + 1 + localPubKey.length);
  header.set(salt);
  header.set(rs, 16);
  header[20] = localPubKey.length;
  header.set(localPubKey, 21);

  const result = new Uint8Array(header.length + encrypted.length);
  result.set(header);
  result.set(encrypted, header.length);
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
