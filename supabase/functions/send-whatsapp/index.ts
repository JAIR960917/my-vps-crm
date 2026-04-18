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

// ========== Module configuration ==========
type ModuleKey = "leads" | "cobrancas" | "renovacoes";
const MODULE_CONFIG: Record<ModuleKey, { dataTable: string; statusTable: string; useFormBuilder: boolean }> = {
  leads:      { dataTable: "crm_leads",      statusTable: "crm_statuses",            useFormBuilder: true  },
  cobrancas:  { dataTable: "crm_cobrancas",  statusTable: "crm_cobranca_statuses",   useFormBuilder: false },
  renovacoes: { dataTable: "crm_renovacoes", statusTable: "crm_renovacao_statuses",  useFormBuilder: false },
};

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

async function sendMessage(session: string, apiKey: string, phone: string, text: string, imageUrl?: string | null) {
  const endpoint = imageUrl ? "/send-image" : "/send-message";
  const body: Record<string, any> = imageUrl
    ? { session, number: phone, text, file: imageUrl }
    : { session, number: phone, text, isGroup: false };

  const response = await fetch(`${APIFULL_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  let result: any = null;
  try { result = responseText ? JSON.parse(responseText) : null; } catch { result = { raw: responseText }; }
  return resolveSendResult(response.ok, result);
}

// Delay between WhatsApp sends to avoid being banned (30 seconds)
const SEND_DELAY_MS = 30_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanPhone(phone: string) {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = clean.substring(1);
  if (!clean.startsWith("55")) clean = "55" + clean;
  return clean;
}

// Resolve phone/name from card data based on module type.
// - leads: uses form builder mappings (is_phone_field / is_name_field)
// - cobrancas/renovacoes: uses fixed keys data.telefone / data.nome
function resolveCardFields(
  module: ModuleKey,
  data: Record<string, any>,
  nameFields: any[],
  phoneFields: any[],
) {
  if (MODULE_CONFIG[module].useFormBuilder) {
    let phone = "";
    for (const f of phoneFields) {
      const val = data[`field_${f.id}`];
      if (val) { phone = val; break; }
    }
    if (!phone) phone = data.telefone || data.phone || "";

    let name = "";
    for (const f of nameFields) {
      const val = data[`field_${f.id}`];
      if (val) { name = val; break; }
    }
    if (!name) name = data.nome_lead || data.nome || "Cliente";

    return { phone, name };
  }
  // Fixed-fields modules
  const phone = data.telefone || data.phone || data.celular || "";
  const name = data.nome || data.nome_lead || data.name || "Cliente";
  return { phone, name };
}

// Resolve session name: from instance_id or fallback to system_settings
async function resolveSession(supabase: any, instanceId: string | null): Promise<string | null> {
  if (instanceId) {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("session, is_active")
      .eq("id", instanceId)
      .single();
    if (data?.is_active) return data.session;
    return null;
  }
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "apifull_session")
    .single();
  return data?.setting_value || null;
}

// Build the set of user_ids that belong to a given company (via profiles + manager_companies)
async function getCompanyUserIds(supabase: any, companyId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data: profs } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("company_id", companyId);
  for (const p of (profs || []) as { user_id: string }[]) ids.add(p.user_id);

  const { data: mgrs } = await supabase
    .from("manager_companies")
    .select("user_id")
    .eq("company_id", companyId);
  for (const m of (mgrs || []) as { user_id: string }[]) ids.add(m.user_id);

  return ids;
}

function filterCardsByCompany(cards: any[], companyUserIds: Set<string>): any[] {
  return cards.filter((l) => {
    const cb = l.created_by;
    const at = l.assigned_to;
    return (cb && companyUserIds.has(cb)) || (at && companyUserIds.has(at));
  });
}

// Resolve the status key from a status_id, given the right status table for the module
async function resolveStatusKey(supabase: any, statusTable: string, statusId: string): Promise<string> {
  const { data } = await supabase.from(statusTable).select("key").eq("id", statusId).single();
  return data?.key || "";
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

    // Form builder fields are only needed for the 'leads' module
    const { data: formFields } = await supabase
      .from("crm_form_fields")
      .select("id, label, is_name_field, is_phone_field");
    const nameFields = (formFields || []).filter((f: any) => f.is_name_field);
    const phoneFields = (formFields || []).filter((f: any) => f.is_phone_field);

    let totalSent = 0;
    let totalErrors = 0;
    let skippedNoCompany = 0;
    let isFirstSend = true;
    const today = new Date().toISOString().split("T")[0];

    const companyUsersCache = new Map<string, Set<string>>();
    const getUsers = async (companyId: string) => {
      if (!companyUsersCache.has(companyId)) {
        companyUsersCache.set(companyId, await getCompanyUserIds(supabase, companyId));
      }
      return companyUsersCache.get(companyId)!;
    };

    // ========== PERIOD CAMPAIGNS ==========
    const { data: campaigns } = await supabase.from("whatsapp_campaigns")
      .select("*").eq("is_active", true).lte("start_date", today).gte("end_date", today);

    if (campaigns && campaigns.length > 0) {
      for (const campaign of campaigns) {
        if (!campaign.company_id) {
          skippedNoCompany++;
          continue;
        }

        const moduleKey = (campaign.module || "leads") as ModuleKey;
        const cfg = MODULE_CONFIG[moduleKey];
        if (!cfg) continue;

        const session = await resolveSession(supabase, campaign.instance_id);
        if (!session) continue;

        const statusKey = await resolveStatusKey(supabase, cfg.statusTable, campaign.status_id);
        if (!statusKey) continue;

        const { data: cards } = await supabase.from(cfg.dataTable)
          .select("id, data, created_by, assigned_to").eq("status", statusKey);
        if (!cards) continue;

        const companyUsers = await getUsers(campaign.company_id);
        const companyCards = filterCardsByCompany(cards, companyUsers);
        if (companyCards.length === 0) continue;

        const { data: existingSends } = await supabase.from("whatsapp_campaign_sends")
          .select("lead_id, status").eq("campaign_id", campaign.id);
        const sentIds = new Set((existingSends || []).filter((s: any) => s.status === "sent").map((s: any) => s.lead_id));
        const pendingCards = companyCards.filter((l: any) => !sentIds.has(l.id));

        const todayStart = new Date(today + "T00:00:00Z").toISOString();
        const todayEnd = new Date(today + "T23:59:59Z").toISOString();
        const { count: sentToday } = await supabase.from("whatsapp_campaign_sends")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id).eq("status", "sent").gte("sent_at", todayStart).lte("sent_at", todayEnd);

        const remaining = campaign.daily_limit - (sentToday || 0);
        if (remaining <= 0) continue;

        for (const card of pendingCards.slice(0, remaining)) {
          const data = typeof card.data === "object" ? (card.data as Record<string, any>) : {};
          const { phone, name } = resolveCardFields(moduleKey, data, nameFields, phoneFields);
          if (!phone) continue;

          const messageBody = campaign.message.replace(/\{nome\}/gi, name);
          const cp = cleanPhone(phone);

          try {
            if (!isFirstSend) await sleep(SEND_DELAY_MS);
            isFirstSend = false;
            const result = await sendMessage(session, APIFULL_API_KEY, cp, messageBody, campaign.image_url);
            if (result.ok) {
              await supabase.from("whatsapp_campaign_sends").insert({ campaign_id: campaign.id, lead_id: card.id, phone: cp, status: "sent", sent_at: new Date().toISOString() });
              totalSent++;
            } else {
              await supabase.from("whatsapp_campaign_sends").insert({ campaign_id: campaign.id, lead_id: card.id, phone: cp, status: "error", error_message: result.errorMessage || "Erro" });
              totalErrors++;
            }
          } catch (e) {
            await supabase.from("whatsapp_campaign_sends").insert({ campaign_id: campaign.id, lead_id: card.id, phone: cp, status: "error", error_message: e instanceof Error ? e.message : "Unknown error" });
            totalErrors++;
          }
        }
      }
    }

    // ========== TRIGGER CAMPAIGNS ==========
    const { data: triggerCampaigns } = await supabase.from("whatsapp_trigger_campaigns")
      .select("*, whatsapp_trigger_steps(*)").eq("is_active", true);

    if (triggerCampaigns && triggerCampaigns.length > 0) {
      for (const tc of triggerCampaigns) {
        if (!tc.company_id) {
          skippedNoCompany++;
          continue;
        }

        const moduleKey = (tc.module || "leads") as ModuleKey;
        const cfg = MODULE_CONFIG[moduleKey];
        if (!cfg) continue;

        const session = await resolveSession(supabase, tc.instance_id);
        if (!session) continue;

        const steps = ((tc as any).whatsapp_trigger_steps || []).sort((a: any, b: any) => a.position - b.position);
        if (steps.length === 0) continue;

        const statusKey = await resolveStatusKey(supabase, cfg.statusTable, tc.status_id);
        if (!statusKey) continue;

        const { data: cardsRaw } = await supabase.from(cfg.dataTable)
          .select("id, data, status, updated_at, created_by, assigned_to").eq("status", statusKey);
        if (!cardsRaw || cardsRaw.length === 0) continue;

        const companyUsers = await getUsers(tc.company_id);
        const cards = filterCardsByCompany(cardsRaw, companyUsers);
        if (cards.length === 0) continue;

        const { data: existingSends } = await supabase.from("whatsapp_trigger_sends")
          .select("lead_id, step_id, status").eq("campaign_id", tc.id);

        const todayStart = new Date(today + "T00:00:00Z").toISOString();
        const todayEnd = new Date(today + "T23:59:59Z").toISOString();
        const { count: sentToday } = await supabase.from("whatsapp_trigger_sends")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", tc.id).eq("status", "sent").gte("sent_at", todayStart).lte("sent_at", todayEnd);

        let remaining = tc.daily_limit - (sentToday || 0);
        if (remaining <= 0) continue;

        const sendsByCard = new Map<string, Set<string>>();
        for (const s of (existingSends || []) as any[]) {
          if (s.status === "sent") {
            if (!sendsByCard.has(s.lead_id)) sendsByCard.set(s.lead_id, new Set());
            sendsByCard.get(s.lead_id)!.add(s.step_id);
          }
        }

        for (const card of cards) {
          if (remaining <= 0) break;

          const data = typeof card.data === "object" ? (card.data as Record<string, any>) : {};
          const { phone, name } = resolveCardFields(moduleKey, data, nameFields, phoneFields);
          if (!phone) continue;

          const sentStepIds = sendsByCard.get(card.id) || new Set();
          const enteredAt = new Date(card.updated_at);
          const now = new Date();
          const daysSinceEntry = Math.floor((now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60 * 24));

          for (const step of steps) {
            if (sentStepIds.has(step.id)) continue;
            if (daysSinceEntry < step.delay_days) continue;

            const messageBody = step.message.replace(/\{nome\}/gi, name);
            const cp = cleanPhone(phone);

            try {
              if (!isFirstSend) await sleep(SEND_DELAY_MS);
              isFirstSend = false;
              const result = await sendMessage(session, APIFULL_API_KEY, cp, messageBody, step.image_url);
              if (result.ok) {
                await supabase.from("whatsapp_trigger_sends").insert({ campaign_id: tc.id, step_id: step.id, lead_id: card.id, phone: cp, status: "sent", sent_at: new Date().toISOString() });
                totalSent++;
                remaining--;
              } else {
                await supabase.from("whatsapp_trigger_sends").insert({ campaign_id: tc.id, step_id: step.id, lead_id: card.id, phone: cp, status: "error", error_message: result.errorMessage || "Erro" });
                totalErrors++;
              }
            } catch (e) {
              await supabase.from("whatsapp_trigger_sends").insert({ campaign_id: tc.id, step_id: step.id, lead_id: card.id, phone: cp, status: "error", error_message: e instanceof Error ? e.message : "Unknown error" });
              totalErrors++;
            }

            break;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Processamento concluído", sent: totalSent, errors: totalErrors, skipped_no_company: skippedNoCompany }),
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
