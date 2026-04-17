// Edge function: ssotica-test-connection
// Faz uma chamada simples na API SSótica para validar token + CNPJ/Código
// e retorna a URL exata + resposta crua para debug.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SSOTICA_BASE = "https://app.ssotica.com.br/api/v1/integracoes";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const integrationId: string | undefined = body.integration_id;
    if (!integrationId) {
      return new Response(JSON.stringify({ ok: false, error: "integration_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integ, error } = await supabase
      .from("ssotica_integrations")
      .select("id, cnpj, license_code, bearer_token")
      .eq("id", integrationId)
      .maybeSingle();

    if (error) throw error;
    if (!integ) {
      return new Response(JSON.stringify({ ok: false, error: "Integração não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    function normalize(v: string | null): string {
      const raw = (v ?? "").trim();
      const onlyDigits = raw.replace(/\D/g, "");
      const isCnpj = !/[a-zA-Z]/.test(raw) && onlyDigits.length === 14;
      return isCnpj ? onlyDigits : raw;
    }

    // Receber: usa código de licença se disponível, senão CNPJ
    const empresaReceber = normalize(integ.license_code || integ.cnpj);
    // Vendas: sempre CNPJ
    const cnpjVendas = normalize(integ.cnpj);

    // Janela curta: últimos 7 dias
    const today = new Date();
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 7);

    const results: any[] = [];

    // Teste 1: Contas a Receber
    const urlReceber = `${SSOTICA_BASE}/financeiro/contas-a-receber/periodo?empresa=${encodeURIComponent(empresaReceber)}&inicio_periodo=${ymd(start)}&fim_periodo=${ymd(today)}&page=1&perPage=1`;
    try {
      const res = await fetch(urlReceber, {
        headers: { Authorization: `Bearer ${integ.bearer_token}`, Accept: "application/json" },
      });
      const text = await res.text();
      results.push({
        endpoint: "contas-a-receber",
        url: urlReceber,
        status: res.status,
        ok: res.ok,
        response: text.slice(0, 500),
      });
    } catch (e) {
      results.push({
        endpoint: "contas-a-receber",
        url: urlReceber,
        status: 0,
        ok: false,
        response: e instanceof Error ? e.message : String(e),
      });
    }

    // Teste 2: Vendas (usa cnpj= e exige CNPJ puro)
    const urlVendas = `${SSOTICA_BASE}/vendas/periodo?cnpj=${encodeURIComponent(cnpjVendas)}&inicio_periodo=${ymd(start)}&fim_periodo=${ymd(today)}`;
    try {
      const res = await fetch(urlVendas, {
        headers: { Authorization: `Bearer ${integ.bearer_token}`, Accept: "application/json" },
      });
      const text = await res.text();
      results.push({
        endpoint: "vendas",
        url: urlVendas,
        status: res.status,
        ok: res.ok,
        response: text.slice(0, 500),
      });
    } catch (e) {
      results.push({
        endpoint: "vendas",
        url: urlVendas,
        status: 0,
        ok: false,
        response: e instanceof Error ? e.message : String(e),
      });
    }

    const allOk = results.every((r) => r.ok);
    return new Response(
      JSON.stringify({
        ok: allOk,
        empresa_param: empresaReceber,
        cnpj_vendas: cnpjVendas,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
