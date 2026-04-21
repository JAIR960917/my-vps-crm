// Probe temporário: testa variações de filtros para recuperar parcelas negativadas
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
    const tituloId: string = String(body.titulo_id ?? "27890528");

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

    const tries: Array<{ name: string; url: string }> = [];

    // Janela máx = 31 dias. Cobrir 12/2025 (parcela 2), 01/2026 (3), 02/2026 (4), 03/2026 (5), 04/2026 (6)
    const janelas = [
      ["2025-12-01", "2025-12-31"],
      ["2026-01-01", "2026-01-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-31"],
      ["2026-04-01", "2026-04-30"],
    ];
    for (const [ini, fim] of janelas) {
      tries.push({
        name: `periodo_${ini}`,
        url: `${BASE}/financeiro/contas-a-receber/periodo?empresa=${empresa}&inicio_periodo=${ini}&fim_periodo=${fim}&page=1&perPage=500`,
      });
    }
    // Flags em janela curta
    for (const extra of [
      "&status=negativado",
      "&situacao=negativado",
      "&incluir_negativados=1",
      "&incluir_negativados=true",
      "&todos=1",
      "&apenas_em_aberto=0",
      "&tipo=todos",
      "&serasa=1",
    ]) {
      tries.push({
        name: `flag${extra}`,
        url: `${BASE}/financeiro/contas-a-receber/periodo?empresa=${empresa}&inicio_periodo=2025-12-01&fim_periodo=2025-12-31&page=1&perPage=500${extra}`,
      });
    }
    tries.push({ name: "titulo_direto", url: `${BASE}/financeiro/contas-a-receber/${tituloId}?empresa=${empresa}` });
    tries.push({ name: "titulos_titulo", url: `${BASE}/financeiro/titulos/${tituloId}?empresa=${empresa}` });
    tries.push({ name: "negativados", url: `${BASE}/financeiro/negativados?empresa=${empresa}` });
    tries.push({ name: "serasa", url: `${BASE}/financeiro/serasa?empresa=${empresa}` });
    tries.push({ name: "parcelas_titulo", url: `${BASE}/financeiro/contas-a-receber/parcelas/${tituloId}?empresa=${empresa}` });
    tries.push({ name: "negativados_periodo", url: `${BASE}/financeiro/negativados/periodo?empresa=${empresa}&inicio_periodo=2025-12-01&fim_periodo=2025-12-31` });
    tries.push({ name: "serasa_periodo", url: `${BASE}/financeiro/serasa/periodo?empresa=${empresa}&inicio_periodo=2025-12-01&fim_periodo=2025-12-31` });

    const out: any[] = [];
    for (const t of tries) {
      try {
        const res = await fetch(t.url, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
        const text = await res.text();
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch { /* not json */ }
        let parcelasDoTitulo: any[] = [];
        let totalItems = 0;
        if (parsed) {
          const arr = Array.isArray(parsed) ? parsed : (parsed.data ?? parsed.items ?? parsed.contas ?? []);
          if (Array.isArray(arr)) {
            totalItems = arr.length;
            for (const it of arr) {
              const tid = String(it.titulo_id ?? it.id_titulo ?? it.titulo?.id ?? it.id ?? "");
              if (tid === tituloId) {
                parcelasDoTitulo.push({
                  parcela: it.parcela ?? it.numero_parcela,
                  vencimento: it.vencimento ?? it.data_vencimento,
                  valor: it.valor,
                  situacao: it.situacao ?? it.status,
                  pago: it.pago ?? it.data_pagamento,
                });
              }
            }
          }
        }
        out.push({
          name: t.name,
          url: t.url,
          status: res.status,
          totalItems,
          parcelasDoTitulo,
          preview: text.slice(0, 300),
        });
      } catch (e) {
        out.push({ name: t.name, url: t.url, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ empresa, tituloId, results: out }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
