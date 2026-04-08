import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    // 1. Find form fields with date_status_ranges
    const { data: dateFields, error: ffErr } = await supabase
      .from("crm_form_fields")
      .select("id, date_status_ranges")
      .not("date_status_ranges", "is", null);

    if (ffErr) throw ffErr;
    if (!dateFields || dateFields.length === 0) {
      return new Response(JSON.stringify({ message: "No date mapping fields configured", updated: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Get all leads
    const { data: leads, error: ldErr } = await supabase
      .from("crm_leads")
      .select("id, data, status");

    if (ldErr) throw ldErr;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: "No leads found", updated: 0 }), {
        headers: { "Content-Type": "application/json" },
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

        // Update if status changed
        if (newStatus && newStatus !== lead.status) {
          const { error: upErr } = await supabase
            .from("crm_leads")
            .update({ status: newStatus })
            .eq("id", lead.id);

          if (!upErr) updatedCount++;
        }
      }
    }

    return new Response(JSON.stringify({ message: "Recalculation complete", updated: updatedCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
