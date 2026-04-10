import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFULL_BASE = "https://api.apifull.com.br/whatsapp";

const SUCCESS_TOKENS = ["success", "sucesso", "sent", "enviado", "accepted", "queued", "ok"];
const ERROR_TOKENS = [
  "error", "erro", "failed", "failure", "invalid", "invalido", "inválido",
  "offline", "disconnected", "desconect", "not connected", "não conectado",
  "nao conectado", "not found", "forbidden", "blocked",
];

function extractApiMessages(result: any) {
  return [
    result?.message, result?.mensagem, result?.error, result?.msg, result?.status,
    result?.data?.message, result?.data?.mensagem, result?.data?.error, result?.data?.msg, result?.data?.status,
  ].map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

function includesToken(values: string[], tokens: string[]) {
  const haystack = values.join(" ").toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

function resolveSendResult(responseOk: boolean, result: any) {
  const messages = extractApiMessages(result);
  const fallback = messages[0] || "A API Full não confirmou o envio da mensagem";
  const boolFlags = [result?.success, result?.sucesso, result?.data?.success].filter((v) => typeof v === "boolean");

  if (!responseOk) return { ok: false, errorMessage: fallback };
  if (boolFlags.includes(false)) return { ok: false, errorMessage: fallback };
  if (includesToken(messages, ERROR_TOKENS)) return { ok: false, errorMessage: fallback };
  if (boolFlags.includes(true) || includesToken(messages, SUCCESS_TOKENS)) return { ok: true, errorMessage: null };
  return { ok: false, errorMessage: "A API Full respondeu sem confirmar claramente que a mensagem foi enviada" };
}

async function sendMessage(session: string, apiKey: string, phone: string, text: string) {
  const response = await fetch(`${APIFULL_BASE}/send-message`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session, number: phone, text, isGroup: false }),
  });
  const responseText = await response.text();
  let result: any = null;
  try { result = responseText ? JSON.parse(responseText) : null; } catch { result = { raw: responseText }; }
  return resolveSendResult(response.ok, result);
}

function cleanPhone(phone: string) {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = clean.substring(1);
  if (!clean.startsWith("55")) clean = "55" + clean;
  return clean;
}

function resolveLeadFields(data: Record<string, any>, nameFields: any[], phoneFields: any[]) {
  let phone = "";
  for (const f of phoneFields) {
    const val = data[`field_${f.id}`];
    if (val) { phone = val; break; }
  }
  if (!phone) phone = data.telefone || "";

  let name = "";
  for (const f of nameFields) {
    const val = data[`field_${f.id}`];
    if (val) { name = val; break; }
  }
  if (!name) name = data.nome_lead || "Cliente";

  return { phone, name };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const APIFULL_API_KEY = Deno.env.get("APIFULL_API_KEY");
    if (!APIFULL_API_KEY) throw new Error("APIFULL_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: sessionSetting } = await supabase
      .from("system_settings").select("setting_value").eq("setting_key", "apifull_session").single();
    const session = sessionSetting?.setting_value;
    if (!session) {
      return new Response(JSON.stringify({ error: "Sessão da API Full não configurada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: formFields } = await supabase.from("crm_form_fields").select("id, label, is_name_field, is_phone_field");
    const nameFields = (formFields || []).filter((f: any) => f.is_name_field);
    const phoneFields = (formFields || []).filter((f: any) => f.is_phone_field);

    let totalSent = 0;
    let totalErrors = 0;

    // ========== PERIOD CAMPAIGNS (existing) ==========
    const today = new Date().toISOString().split("T")[0];
    const { data: campaigns } = await supabase.from("whatsapp_campaigns")
      .select("*").eq("is_active", true).lte("start_date", today).gte("end_date", today);

    if (campaigns && campaigns.length > 0) {
      for (const campaign of campaigns) {
        const { data: statusData } = await supabase.from("crm_statuses").select("key").eq("id", campaign.status_id).single();
        const statusKey = statusData?.key || "";

        const { data: leads } = await supabase.from("crm_leads").select("id, data").eq("status", statusKey);
        if (!leads) continue;

        const { data: existingSends } = await supabase.from("whatsapp_campaign_sends")
          .select("lead_id, status").eq("campaign_id", campaign.id);
        const sentLeadIds = new Set((existingSends || []).filter((s: any) => s.status === "sent").map((s: any) => s.lead_id));
        const pendingLeads = leads.filter((l: any) => !sentLeadIds.has(l.id));

        const todayStart = new Date(today + "T00:00:00Z").toISOString();
        const todayEnd = new Date(today + "T23:59:59Z").toISOString();
        const { count: sentToday } = await supabase.from("whatsapp_campaign_sends")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id).eq("status", "sent").gte("sent_at", todayStart).lte("sent_at", todayEnd);

        const remaining = campaign.daily_limit - (sentToday || 0);
        if (remaining <= 0) continue;

        for (const lead of pendingLeads.slice(0, remaining)) {
          const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};
          const { phone, name } = resolveLeadFields(data, nameFields, phoneFields);
          if (!phone) continue;

          const messageBody = campaign.message.replace(/\{nome\}/gi, name);
          const cp = cleanPhone(phone);

          try {
            const result = await sendMessage(session, APIFULL_API_KEY, cp, messageBody);
            if (result.ok) {
              await supabase.from("whatsapp_campaign_sends").insert({ campaign_id: campaign.id, lead_id: lead.id, phone: cp, status: "sent", sent_at: new Date().toISOString() });
              totalSent++;
            } else {
              await supabase.from("whatsapp_campaign_sends").insert({ campaign_id: campaign.id, lead_id: lead.id, phone: cp, status: "error", error_message: result.errorMessage || "Erro" });
              totalErrors++;
            }
          } catch (e) {
            await supabase.from("whatsapp_campaign_sends").insert({ campaign_id: campaign.id, lead_id: lead.id, phone: cp, status: "error", error_message: e instanceof Error ? e.message : "Unknown error" });
            totalErrors++;
          }
        }
      }
    }

    // ========== TRIGGER CAMPAIGNS (new) ==========
    const { data: triggerCampaigns } = await supabase.from("whatsapp_trigger_campaigns")
      .select("*, whatsapp_trigger_steps(*)").eq("is_active", true);

    if (triggerCampaigns && triggerCampaigns.length > 0) {
      for (const tc of triggerCampaigns) {
        const steps = ((tc as any).whatsapp_trigger_steps || []).sort((a: any, b: any) => a.position - b.position);
        if (steps.length === 0) continue;

        const { data: statusData } = await supabase.from("crm_statuses").select("key").eq("id", tc.status_id).single();
        const statusKey = statusData?.key || "";

        // Get leads currently in this status
        const { data: leads } = await supabase.from("crm_leads").select("id, data, status, updated_at").eq("status", statusKey);
        if (!leads || leads.length === 0) continue;

        // Get all sends for this trigger campaign
        const { data: existingSends } = await supabase.from("whatsapp_trigger_sends")
          .select("lead_id, step_id, status").eq("campaign_id", tc.id);

        // Daily limit check
        const todayStart = new Date(today + "T00:00:00Z").toISOString();
        const todayEnd = new Date(today + "T23:59:59Z").toISOString();
        const { count: sentToday } = await supabase.from("whatsapp_trigger_sends")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", tc.id).eq("status", "sent").gte("sent_at", todayStart).lte("sent_at", todayEnd);

        let remaining = tc.daily_limit - (sentToday || 0);
        if (remaining <= 0) continue;

        const sendsByLead = new Map<string, Set<string>>();
        for (const s of (existingSends || []) as any[]) {
          if (s.status === "sent") {
            if (!sendsByLead.has(s.lead_id)) sendsByLead.set(s.lead_id, new Set());
            sendsByLead.get(s.lead_id)!.add(s.step_id);
          }
        }

        for (const lead of leads) {
          if (remaining <= 0) break;

          const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};
          const { phone, name } = resolveLeadFields(data, nameFields, phoneFields);
          if (!phone) continue;

          const sentStepIds = sendsByLead.get(lead.id) || new Set();

          // Calculate days since lead entered this status (using updated_at as proxy)
          const enteredAt = new Date(lead.updated_at);
          const now = new Date();
          const daysSinceEntry = Math.floor((now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60 * 24));

          for (const step of steps) {
            if (sentStepIds.has(step.id)) continue; // Already sent
            if (daysSinceEntry < step.delay_days) continue; // Not time yet

            const messageBody = step.message.replace(/\{nome\}/gi, name);
            const cp = cleanPhone(phone);

            try {
              const result = await sendMessage(session, APIFULL_API_KEY, cp, messageBody);
              if (result.ok) {
                await supabase.from("whatsapp_trigger_sends").insert({ campaign_id: tc.id, step_id: step.id, lead_id: lead.id, phone: cp, status: "sent", sent_at: new Date().toISOString() });
                totalSent++;
                remaining--;
              } else {
                await supabase.from("whatsapp_trigger_sends").insert({ campaign_id: tc.id, step_id: step.id, lead_id: lead.id, phone: cp, status: "error", error_message: result.errorMessage || "Erro" });
                totalErrors++;
              }
            } catch (e) {
              await supabase.from("whatsapp_trigger_sends").insert({ campaign_id: tc.id, step_id: step.id, lead_id: lead.id, phone: cp, status: "error", error_message: e instanceof Error ? e.message : "Unknown error" });
              totalErrors++;
            }

            break; // Send only one step per lead per cycle to avoid flooding
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Processamento concluído", sent: totalSent, errors: totalErrors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-whatsapp error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
