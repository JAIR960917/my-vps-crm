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

    // 1. Sem filtro de status, janela larga
    tries.push({
      name: "periodo_sem_filtro",
      url: `${BASE}/financeiro/contas-a-receber/periodo?empresa=${empresa}&inicio_periodo=2025-11-01&fim_periodo=2026-05-31&page=1&perPage=500`,
    });
    // 2. Com possíveis flags de status
    for (const extra of [
      "&status=todos",
      "&status=negativado",
      "&status=em_aberto",
      "&situacao=todos",
      "&situacao=negativado_serasa",
      "&incluir_negativados=1",
      "&incluir_negativados=true",
      "&todos=1",
      "&apenas_em_aberto=0",
    ]) {
      tries.push({
        name: `periodo${extra}`,
        url: `${BASE}/financeiro/contas-a-receber/periodo?empresa=${empresa}&inicio_periodo=2025-11-01&fim_periodo=2026-05-31&page=1&perPage=500${extra}`,
      });
    }
    // 3. Endpoints alternativos possíveis
    tries.push({ name: "titulo_direto", url: `${BASE}/financeiro/contas-a-receber/${tituloId}?empresa=${empresa}` });
    tries.push({ name: "titulos_titulo", url: `${BASE}/financeiro/titulos/${tituloId}?empresa=${empresa}` });
    tries.push({ name: "negativados", url: `${BASE}/financeiro/negativados?empresa=${empresa}` });
    tries.push({ name: "serasa", url: `${BASE}/financeiro/serasa?empresa=${empresa}` });
    tries.push({ name: "parcelas_titulo", url: `${BASE}/financeiro/contas-a-receber/parcelas/${tituloId}?empresa=${empresa}` });

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
