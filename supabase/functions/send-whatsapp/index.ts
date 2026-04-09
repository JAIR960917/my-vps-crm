import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the Twilio WhatsApp number from system_settings
    const { data: twilioSettings } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "twilio_whatsapp_number")
      .single();

    const fromNumber = twilioSettings?.setting_value;
    if (!fromNumber) {
      return new Response(
        JSON.stringify({ error: "Número WhatsApp Twilio não configurado nas configurações do sistema" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for pending messages that are due
    const now = new Date().toISOString();
    const { data: pendingMessages, error: fetchError } = await supabase
      .from("scheduled_whatsapp_messages")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now);

    if (fetchError) {
      console.error("Error fetching pending messages:", fetchError);
      throw new Error(`DB fetch error: ${fetchError.message}`);
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma mensagem pendente", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const msg of pendingMessages) {
      try {
        // Format phone for WhatsApp
        const toPhone = msg.phone.startsWith("+") ? msg.phone : `+${msg.phone}`;

        const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TWILIO_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: `whatsapp:${toPhone}`,
            From: `whatsapp:${fromNumber}`,
            Body: msg.message,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error(`Twilio error for msg ${msg.id}:`, result);
          await supabase
            .from("scheduled_whatsapp_messages")
            .update({
              status: "error",
              error_message: result.message || `HTTP ${response.status}`,
            })
            .eq("id", msg.id);
          errorCount++;
        } else {
          await supabase
            .from("scheduled_whatsapp_messages")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", msg.id);
          sentCount++;
          console.log(`Message ${msg.id} sent successfully, SID: ${result.sid}`);
        }
      } catch (e) {
        console.error(`Error sending msg ${msg.id}:`, e);
        await supabase
          .from("scheduled_whatsapp_messages")
          .update({
            status: "error",
            error_message: e instanceof Error ? e.message : "Unknown error",
          })
          .eq("id", msg.id);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processamento concluído`,
        sent: sentCount,
        errors: errorCount,
        total: pendingMessages.length,
      }),
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
