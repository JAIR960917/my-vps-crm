// Probe: pagina TODAS as páginas e procura todas as ocorrências do título.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://app.ssotica.com.br/api/v1/integracoes";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const integrationId: string = body.integration_id;
    const tituloId = Number(body.titulo_id ?? 27890528);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integ } = await supabase
      .from("ssotica_integrations")
      .select("cnpj, license_code, bearer_token")
      .eq("id", integrationId)
      .maybeSingle();

    if (!integ) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: corsHeaders });
    if (integ.bearer_token?.startsWith("enc:")) {
      const { data } = await supabase.rpc("decrypt_secret", { _ciphertext: integ.bearer_token });
      if (typeof data === "string") integ.bearer_token = data;
    }
    if (integ.license_code?.startsWith("enc:")) {
      const { data } = await supabase.rpc("decrypt_secret", { _ciphertext: integ.license_code });
      if (typeof data === "string") integ.license_code = data;
    }

    const empresa = (integ.license_code || integ.cnpj.replace(/\D/g, "")).trim();
    const tok = integ.bearer_token;

    const ini: string = body.ini ?? "2025-12-01";
    const fim: string = body.fim ?? "2025-12-31";
    const janelas: string[][] = [[ini, fim]];

    const encontradas: any[] = [];
    const resumo: any[] = [];
    const situacoesGlobais = new Map<string, number>();

    for (const [ini, fim] of janelas) {
      let page = 1;
      let total = 0;
      let totalPages = 1;
      while (page <= totalPages) {
        const url = `${BASE}/financeiro/contas-a-receber/periodo?empresa=${empresa}&inicio_periodo=${ini}&fim_periodo=${fim}&page=${page}&perPage=100`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
        const json = await res.json().catch(() => ({}));
        totalPages = json.totalPages ?? 1;
        const items: any[] = json.data ?? [];
        total += items.length;
        for (const p of items) {
          const sit = String(p.situacao ?? "");
          situacoesGlobais.set(sit, (situacoesGlobais.get(sit) ?? 0) + 1);
          const tid = Number(p.titulo?.id ?? 0);
          if (tid === tituloId) {
            encontradas.push({
              janela: ini,
              page,
              parcela_id: p.id,
              numero_parcela: p.numero_parcela,
              vencimento: p.vencimento,
              valor: p.valor,
              valor_reajustado: p.valor_reajustado,
              situacao: p.situacao,
              data_pagamento: p.data_pagamento ?? null,
              baixado_em: p.baixado_em ?? null,
              titulo_id: tid,
              cliente_id: p.titulo?.cliente?.id ?? p.cliente?.id,
              cliente_nome: p.titulo?.cliente?.nome ?? p.cliente?.nome,
            });
          }
        }
        page++;
      }
      resumo.push({ janela: ini, totalItems: total, totalPages });
    }

    return new Response(JSON.stringify({
      empresa,
      tituloId,
      resumo,
      encontradas_total: encontradas.length,
      encontradas,
      situacoes_globais: Object.fromEntries(situacoesGlobais),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
