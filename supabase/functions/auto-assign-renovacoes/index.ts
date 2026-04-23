// Edge function: distribui em round-robin os leads de renovação SEM responsável
// entre os vendedores ativos de cada loja (ssotica_company_id).
// Permitido apenas para admin ou gerente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  company_id?: string | null; // se null/ausente, processa todas as lojas
}

const DIRECIONAMENTO_STATUS = "fazer_direcionamento_para_o_vendedor";

// Mantido em sincronia com supabase/functions/ssotica-sync/index.ts e
// src/pages/ActiveClientsPage.tsx — mapeia dias desde a última compra para
// a key da coluna em crm_renovacao_statuses.
function statusKeyForRenovacao(diasDesdeUltimaCompra: number | null): string {
  if (diasDesdeUltimaCompra === null) return "novo";
  if (diasDesdeUltimaCompra < 365) return "em_contato";
  if (diasDesdeUltimaCompra < 730) return "agendado";
  if (diasDesdeUltimaCompra < 1095) return "renovado";
  return "mais_de_3_anos";
}

function flowStatusFromDate(dateValue: string | null | undefined): string {
  if (!dateValue) return "novo";
  const ts = new Date(dateValue).getTime();
  if (Number.isNaN(ts)) return "novo";
  const dias = Math.floor((Date.now() - ts) / 86400000);
  return statusKeyForRenovacao(dias);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Autenticar usuário
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Verifica papel (admin ou gerente)
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isAdmin = roleSet.has("admin");
    const isGerente = roleSet.has("gerente");
    if (!isAdmin && !isGerente) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Body = {};
    try { body = await req.json(); } catch (_) { /* corpo vazio ok */ }
    const targetCompany = body.company_id ?? null;

    // Para gerente, restringir à própria loja
    let allowedCompanies: string[] | null = null;
    if (!isAdmin) {
      const { data: prof } = await admin
        .from("profiles")
        .select("company_id")
        .eq("user_id", uid)
        .maybeSingle();
      const { data: extras } = await admin
        .from("manager_companies")
        .select("company_id")
        .eq("user_id", uid);
      const set = new Set<string>();
      if (prof?.company_id) set.add(prof.company_id);
      (extras ?? []).forEach((e: any) => set.add(e.company_id));
      allowedCompanies = Array.from(set);
      if (allowedCompanies.length === 0) {
        return new Response(JSON.stringify({ error: "Sem loja vinculada" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Lista lojas a processar
    let companiesQ = admin
      .from("crm_renovacoes")
      .select("ssotica_company_id")
      .is("assigned_to", null)
      .not("ssotica_company_id", "is", null);
    if (targetCompany) companiesQ = companiesQ.eq("ssotica_company_id", targetCompany);
    const { data: companyRows } = await companiesQ;
    let companyIds = Array.from(
      new Set((companyRows ?? []).map((r: any) => r.ssotica_company_id as string)),
    );
    if (allowedCompanies) {
      companyIds = companyIds.filter((cid) => allowedCompanies!.includes(cid));
    }

    let totalAssigned = 0;
    const perCompany: Record<string, { assigned: number; vendedores: number }> = {};

    for (const cid of companyIds) {
      // Vendedores ativos da loja (role = vendedor)
      const { data: profs } = await admin
        .from("profiles")
        .select("user_id")
        .eq("company_id", cid);
      const userIds = (profs ?? []).map((p: any) => p.user_id);
      if (userIds.length === 0) {
        perCompany[cid] = { assigned: 0, vendedores: 0 };
        continue;
      }
      const { data: rolesData } = await admin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const vendedores = (rolesData ?? [])
        .filter((r: any) => r.role === "vendedor")
        .map((r: any) => r.user_id as string)
        .sort();

      if (vendedores.length === 0) {
        perCompany[cid] = { assigned: 0, vendedores: 0 };
        continue;
      }

      // Pega TODOS os leads sem responsável dessa loja (paginado)
      const PAGE = 1000;
      let from = 0;
      const rows: { id: string; data_ultima_compra: string | null; status: string }[] = [];
      while (true) {
        const { data: page } = await admin
          .from("crm_renovacoes")
          .select("id, data_ultima_compra, status")
          .eq("ssotica_company_id", cid)
          .is("assigned_to", null)
          .range(from, from + PAGE - 1);
        const arr = (page ?? []) as any[];
        rows.push(...arr.map((r) => ({
          id: r.id as string,
          data_ultima_compra: r.data_ultima_compra ?? null,
          status: r.status as string,
        })));
        if (arr.length < PAGE) break;
        from += PAGE;
      }

      // Round-robin determinístico ordenando por id (estável, idempotente)
      rows.sort((a, b) => a.id.localeCompare(b.id));
      let assignedHere = 0;
      // Agrupa por (vendedor, novoStatus). Quando o card está na coluna
      // "fazer direcionamento", recalcula o status para o flow normal a
      // partir da data da última compra. Status manuais (em_atendimento,
      // nunca_fez_exame) são preservados.
      const buckets: Record<string, { ids: string[]; status: string | null; userId: string }> = {};
      rows.forEach((row, idx) => {
        const userId = vendedores[idx % vendedores.length];
        const isManual = row.status === "em_atendimento" || row.status === "nunca_fez_exame";
        const newStatus = !isManual && row.status === DIRECIONAMENTO_STATUS
          ? flowStatusFromDate(row.data_ultima_compra)
          : null; // null = não atualizar status
        const key = `${userId}|${newStatus ?? "__keep__"}`;
        (buckets[key] ??= { ids: [], status: newStatus, userId }).ids.push(row.id);
      });

      for (const { ids: leadIds, status, userId } of Object.values(buckets)) {
        for (let i = 0; i < leadIds.length; i += 200) {
          const slice = leadIds.slice(i, i + 200);
          const update: Record<string, any> = { assigned_to: userId };
          if (status) update.status = status;
          const { error } = await admin
            .from("crm_renovacoes")
            .update(update)
            .in("id", slice);
          if (!error) assignedHere += slice.length;
        }
      }

      perCompany[cid] = { assigned: assignedHere, vendedores: vendedores.length };
      totalAssigned += assignedHere;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total_assigned: totalAssigned,
        companies: perCompany,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Erro inesperado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
