// Edge function: ssotica-vendas-periodo
// Busca todas as vendas (com itens/produtos) de um período em uma ou mais empresas SSótica.
// Usado pelo Relatório de Vendas por Vendedor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SSOTICA_BASE = "https://app.ssotica.com.br/api/v1/integracoes";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

function buildWindows(start: Date, end: Date, sizeDays = 30) {
  const windows: { start: string; end: string }[] = [];
  let cur = new Date(start);
  while (cur <= end) {
    const w_end = addDays(cur, sizeDays - 1);
    const finalEnd = w_end > end ? end : w_end;
    windows.push({ start: ymd(cur), end: ymd(finalEnd) });
    cur = addDays(finalEnd, 1);
  }
  return windows;
}

function normalizeIdentifier(s: string) {
  return (s || "").replace(/[^0-9]/g, "");
}

async function fetchSSotica(url: string, token: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SSótica ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const startDate: string = body.startDate;
    const endDate: string = body.endDate;
    const companyId: string | null = body.companyId || null;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate e endDate são obrigatórios (formato YYYY-MM-DD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica papel (admin ou gerente)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    const isGerente = (roles || []).some((r: any) => r.role === "gerente");
    if (!isAdmin && !isGerente) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca integrações SSótica (todas para admin; do(s) próprio(s) company_id para gerente)
    let integQuery = supabase
      .from("ssotica_integrations")
      .select("id, company_id, cnpj, bearer_token, is_active");

    if (companyId) {
      integQuery = integQuery.eq("company_id", companyId);
    } else if (!isAdmin) {
      // Gerente sem filtro: usar empresas dele (profile + manager_companies)
      const { data: prof } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: mc } = await supabase
        .from("manager_companies")
        .select("company_id")
        .eq("user_id", user.id);
      const ids = new Set<string>();
      if (prof?.company_id) ids.add(prof.company_id);
      (mc || []).forEach((m: any) => m.company_id && ids.add(m.company_id));
      if (ids.size === 0) {
        return new Response(
          JSON.stringify({ vendas: [], total_vendas: 0, total_itens: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      integQuery = integQuery.in("company_id", Array.from(ids));
    }

    const { data: integrations, error: integErr } = await integQuery;
    if (integErr) throw integErr;
    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ vendas: [], total_vendas: 0, total_itens: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const windows = buildWindows(start, end, 30);

    // Mapa company_id -> nome
    const { data: companiesData } = await supabase
      .from("companies")
      .select("id, name");
    const compName = new Map<string, string>(
      (companiesData || []).map((c: any) => [c.id, c.name]),
    );

    const vendasOut: any[] = [];

    for (const integ of integrations) {
      if (!integ.is_active) continue;

      let token = integ.bearer_token;
      if (token && token.startsWith("enc:")) {
        const { data: dec } = await supabase.rpc("decrypt_secret", { _ciphertext: token });
        if (typeof dec === "string") token = dec;
      }
      const cnpj = normalizeIdentifier(integ.cnpj);

      for (const w of windows) {
        const url = `${SSOTICA_BASE}/vendas/periodo?cnpj=${encodeURIComponent(cnpj)}&inicio_periodo=${w.start}&fim_periodo=${w.end}`;
        try {
          const vendas = await fetchSSotica(url, token);
          if (!Array.isArray(vendas)) continue;
          for (const venda of vendas) {
            // Filtra vendas dentro do range (a janela de 30 dias pode incluir extra)
            const vData = String(venda.data || "");
            if (vData < startDate || vData > endDate) continue;

            vendasOut.push({
              id: venda.id,
              data: venda.data,
              hora: venda.hora,
              numero: venda.numero,
              status: venda.status,
              valor_bruto: Number(venda.valor_bruto ?? 0),
              valor_liquido: Number(venda.valor_liquido ?? 0),
              desconto: Number(venda.desconto ?? 0),
              company_id: integ.company_id,
              company_name: compName.get(integ.company_id) || "—",
              cliente: venda.cliente
                ? { id: venda.cliente.id, nome: venda.cliente.nome }
                : null,
              funcionario: venda.funcionario
                ? {
                    id: venda.funcionario.id,
                    nome: venda.funcionario.nome,
                    funcao: venda.funcionario.funcao,
                  }
                : null,
              itens: Array.isArray(venda.itens)
                ? venda.itens.map((it: any) => ({
                    id: it.id,
                    quantidade: Number(it.quantidade ?? 0),
                    valor_unitario_liquido: Number(it.valor_unitario_liquido ?? 0),
                    valor_total_liquido: Number(it.valor_total_liquido ?? 0),
                    produto: it.produto
                      ? {
                          id: it.produto.id,
                          referencia: it.produto.referencia,
                          descricao: it.produto.descricao,
                          grupo: it.produto.grupo,
                          grife: it.produto.grife,
                        }
                      : null,
                  }))
                : [],
            });
          }
        } catch (err) {
          console.error(`[ssotica-vendas-periodo] ${integ.cnpj} ${w.start}→${w.end}`, err);
        }
      }
    }

    vendasOut.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    const totalItens = vendasOut.reduce((acc, v) => acc + v.itens.length, 0);

    return new Response(
      JSON.stringify({
        start: startDate,
        end: endDate,
        total_vendas: vendasOut.length,
        total_itens: totalItens,
        vendas: vendasOut,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ssotica-vendas-periodo] erro", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
