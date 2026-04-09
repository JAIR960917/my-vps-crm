import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  // Verify caller is authenticated and is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
  if (!caller) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: callerRoles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const isAdmin = callerRoles?.some((r) => r.role === "admin");
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Sem permissão" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Find form fields with date_status_ranges
    const { data: dateFields, error: ffErr } = await supabaseAdmin
      .from("crm_form_fields")
      .select("id, date_status_ranges")
      .not("date_status_ranges", "is", null);

    if (ffErr) throw ffErr;
    if (!dateFields || dateFields.length === 0) {
      return new Response(JSON.stringify({ message: "No date mapping fields configured", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get all leads
    const { data: leads, error: ldErr } = await supabaseAdmin
      .from("crm_leads")
      .select("id, data, status");

    if (ldErr) throw ldErr;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: "No leads found", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;

    for (const lead of leads) {
      const leadData = (typeof lead.data === "object" && lead.data !== null) ? lead.data as Record<string, any> : {};

      for (const df of dateFields) {
        const config = df.date_status_ranges as {
          ranges: { max_years: number; status_key: string }[];
          above_all: string;
          no_answer: string;
        };
        if (!config) continue;

        const fieldKey = `field_${df.id}`;
        const dateVal = leadData[fieldKey];

        let newStatus: string | null = null;

        if (!dateVal || (typeof dateVal === "string" && !dateVal.trim())) {
          if (config.no_answer) newStatus = config.no_answer;
        } else {
          const diffMs = Date.now() - new Date(dateVal).getTime();
          const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
          const sortedRanges = [...config.ranges].sort((a, b) => a.max_years - b.max_years);

          let matched = false;
          for (const range of sortedRanges) {
            if (diffYears <= range.max_years && range.status_key) {
              newStatus = range.status_key;
              matched = true;
              break;
            }
          }
          if (!matched && config.above_all) {
            newStatus = config.above_all;
          }
        }

        if (newStatus && newStatus !== lead.status) {
          const { error: upErr } = await supabaseAdmin
            .from("crm_leads")
            .update({ status: newStatus })
            .eq("id", lead.id);

          if (!upErr) updatedCount++;
        }
      }
    }

    return new Response(JSON.stringify({ message: "Recalculation complete", updated: updatedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Falha ao recalcular status" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
