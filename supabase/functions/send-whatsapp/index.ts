import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFULL_BASE = "https://api.apifull.com.br/whatsapp";

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

    // Get API Full session name from settings
    const { data: sessionSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "apifull_session")
      .single();

    const session = sessionSetting?.setting_value;
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Sessão da API Full não configurada. Vá em Configurações > WhatsApp." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    // Get active campaigns where today is within the date range
    const { data: campaigns, error: campErr } = await supabase
      .from("whatsapp_campaigns")
      .select("*")
      .eq("is_active", true)
      .lte("start_date", today)
      .gte("end_date", today);

    if (campErr) throw new Error(`Error fetching campaigns: ${campErr.message}`);
    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma campanha ativa hoje", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get form fields for name/phone resolution
    const { data: formFields } = await supabase
      .from("crm_form_fields")
      .select("id, label, is_name_field, is_phone_field");

    const nameFields = (formFields || []).filter((f: any) => f.is_name_field);
    const phoneFields = (formFields || []).filter((f: any) => f.is_phone_field);

    let totalSent = 0;
    let totalErrors = 0;

    for (const campaign of campaigns) {
      // Get leads in this status
      const { data: statusData } = await supabase
        .from("crm_statuses")
        .select("key")
        .eq("id", campaign.status_id)
        .single();

      const statusKey = statusData?.key || "";

      const { data: leads, error: leadsErr } = await supabase
        .from("crm_leads")
        .select("id, data")
        .eq("status", statusKey);

      if (leadsErr || !leads) {
        console.error(`Error fetching leads for campaign ${campaign.id}:`, leadsErr);
        continue;
      }

      // Get already sent lead IDs for this campaign
      const { data: existingSends } = await supabase
        .from("whatsapp_campaign_sends")
        .select("lead_id")
        .eq("campaign_id", campaign.id);

      const sentLeadIds = new Set((existingSends || []).map((s: any) => s.lead_id));
      const pendingLeads = leads.filter((l: any) => !sentLeadIds.has(l.id));

      // Check daily limit
      const todayStart = new Date(today + "T00:00:00Z").toISOString();
      const todayEnd = new Date(today + "T23:59:59Z").toISOString();
      const { count: sentToday } = await supabase
        .from("whatsapp_campaign_sends")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("status", "sent")
        .gte("sent_at", todayStart)
        .lte("sent_at", todayEnd);

      const remaining = campaign.daily_limit - (sentToday || 0);
      if (remaining <= 0) {
        console.log(`Campaign ${campaign.id} daily limit reached (${campaign.daily_limit})`);
        continue;
      }

      const toSend = pendingLeads.slice(0, remaining);

      for (const lead of toSend) {
        const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};

        // Resolve phone
        let phone = "";
        for (const f of phoneFields) {
          const val = data[`field_${f.id}`];
          if (val) { phone = val; break; }
        }
        if (!phone) phone = data.telefone || "";
        if (!phone) {
          console.log(`Lead ${lead.id} has no phone, skipping`);
          continue;
        }

        // Resolve name
        let leadName = "";
        for (const f of nameFields) {
          const val = data[`field_${f.id}`];
          if (val) { leadName = val; break; }
        }
        if (!leadName) leadName = data.nome_lead || "Cliente";

        const messageBody = campaign.message.replace(/\{nome\}/gi, leadName);

        // Clean phone: remove non-digits, ensure country code
        let cleanPhone = phone.replace(/\D/g, "");
        if (cleanPhone.startsWith("0")) cleanPhone = cleanPhone.substring(1);
        if (!cleanPhone.startsWith("55")) cleanPhone = "55" + cleanPhone;

        try {
          const response = await fetch(`${APIFULL_BASE}/send-message`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${APIFULL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session,
              number: cleanPhone,
              text: messageBody,
              isGroup: false,
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            console.error(`API Full error for lead ${lead.id}:`, result);
            await supabase.from("whatsapp_campaign_sends").insert({
              campaign_id: campaign.id,
              lead_id: lead.id,
              phone: cleanPhone,
              status: "error",
              error_message: result.message || result.error || `HTTP ${response.status}`,
            });
            totalErrors++;
          } else {
            await supabase.from("whatsapp_campaign_sends").insert({
              campaign_id: campaign.id,
              lead_id: lead.id,
              phone: cleanPhone,
              status: "sent",
              sent_at: new Date().toISOString(),
            });
            totalSent++;
            console.log(`Campaign ${campaign.id}: sent to lead ${lead.id}`);
          }
        } catch (e) {
          console.error(`Error sending to lead ${lead.id}:`, e);
          await supabase.from("whatsapp_campaign_sends").insert({
            campaign_id: campaign.id,
            lead_id: lead.id,
            phone: cleanPhone,
            status: "error",
            error_message: e instanceof Error ? e.message : "Unknown error",
          });
          totalErrors++;
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
