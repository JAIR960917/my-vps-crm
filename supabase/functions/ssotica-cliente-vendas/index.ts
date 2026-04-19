// Edge function: ssotica-cliente-vendas
// Busca o histórico completo de vendas (com itens/produtos) de um cliente SSótica.
// Varre o período em janelas de 30 dias e agrega tudo do cliente_id solicitado.
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
    const { ssoticaClienteId, ssoticaCompanyId, monthsBack } = await req.json();
    if (!ssoticaClienteId || !ssoticaCompanyId) {
      return new Response(
        JSON.stringify({ error: "ssoticaClienteId e ssoticaCompanyId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Valida usuário autenticado
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

    // Pega integração da empresa
    const { data: integ, error: integErr } = await supabase
      .from("ssotica_integrations")
      .select("cnpj, bearer_token, is_active")
      .eq("company_id", ssoticaCompanyId)
      .maybeSingle();

    if (integErr || !integ) {
      return new Response(
        JSON.stringify({ error: "Integração SSótica não encontrada para esta empresa" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!integ.is_active) {
      return new Response(
        JSON.stringify({ error: "Integração SSótica inativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Descriptografa token criptografado em repouso
    if (integ.bearer_token && integ.bearer_token.startsWith("enc:")) {
      const { data: dec } = await supabase.rpc("decrypt_secret", { _ciphertext: integ.bearer_token });
      if (typeof dec === "string") integ.bearer_token = dec;
    }

    const cnpj = normalizeIdentifier(integ.cnpj);
    const targetClienteId = Number(ssoticaClienteId);

    // Janela: padrão 24 meses, máximo 96 (8 anos) se solicitado
    const months = Math.min(Math.max(Number(monthsBack) || 24, 1), 96);
    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - months);

    const windows = buildWindows(start, today, 30);
    const vendasCliente: any[] = [];

    for (const w of windows) {
      const url = `${SSOTICA_BASE}/vendas/periodo?cnpj=${encodeURIComponent(cnpj)}&inicio_periodo=${w.start}&fim_periodo=${w.end}`;
      try {
        const vendas = await fetchSSotica(url, integ.bearer_token);
        if (!Array.isArray(vendas)) continue;
        for (const venda of vendas) {
          if (venda?.cliente?.id === targetClienteId) {
            vendasCliente.push({
              id: venda.id,
              data: venda.data,
              hora: venda.hora,
              numero: venda.numero,
              status: venda.status,
              valor_bruto: Number(venda.valor_bruto ?? 0),
              valor_liquido: Number(venda.valor_liquido ?? 0),
              desconto: Number(venda.desconto ?? 0),
              funcionario: venda.funcionario
                ? { id: venda.funcionario.id, nome: venda.funcionario.nome, funcao: venda.funcionario.funcao }
                : null,
              formas_pagamento: Array.isArray(venda.formas_pagamento)
                ? venda.formas_pagamento.map((fp: any) => ({
                    forma_pagamento: fp.forma_pagamento,
                    valor: Number(fp.valor ?? 0),
                    qtd_parcelas: fp.qtd_parcelas,
                    data: fp.data,
                  }))
                : [],
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
                    ordem_servico: it.ordem_servico
                      ? {
                          numero: it.ordem_servico.numero,
                          status_detalhado: it.ordem_servico.status_detalhado,
                          entrega: it.ordem_servico.entrega,
                        }
                      : null,
                  }))
                : [],
            });
          }
        }
      } catch (err) {
        console.error(`[ssotica-cliente-vendas] janela ${w.start}→${w.end}`, err);
      }
    }

    // Ordena: venda mais recente primeiro
    vendasCliente.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    return new Response(
      JSON.stringify({
        cliente_id: targetClienteId,
        months_back: months,
        total_vendas: vendasCliente.length,
        vendas: vendasCliente,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ssotica-cliente-vendas] erro", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
