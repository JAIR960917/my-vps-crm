// Edge function: ssotica-sync
// Sincroniza Vendas (→ Renovações) e Contas a Receber (→ Cobranças) das lojas SSótica
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SSOTICA_BASE = "https://app.ssotica.com.br/api/v1/integracoes";
const MAX_WINDOW_DAYS = 30; // limite da API
const INITIAL_LOOKBACK_DAYS = 180; // 6 meses na carga inicial

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setUTCDate(nd.getUTCDate() + n);
  return nd;
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

// Mapeia dias de atraso para a key da coluna em crm_cobranca_statuses.
// dias < 0 = ainda vai vencer; dias >= 0 = já venceu.
function statusKeyForDiasAtraso(dias: number): string {
  if (dias <= -1) return "pendente";                                   // 1 dia antes do vencimento (ou mais)
  if (dias >= 0 && dias <= 4) return "em_cobranca";                    // 1 a 4 dias de atraso
  if (dias >= 5 && dias <= 14) return "5_dias_de_atraso";              // 5 a 14 dias
  if (dias >= 15 && dias <= 29) return "atrasado";                     // 15 a 29 dias
  if (dias >= 30 && dias <= 30) return "30_dias_de_atraso";            // 30
  if (dias >= 31 && dias <= 44) return "31_dias_de_atraso_ligao";      // 31-44
  if (dias >= 45 && dias <= 59) return "45_dias_de_atrasomensagem_automtica"; // 45-59
  if (dias >= 60 && dias <= 60) return "60_dias_de_atraso_ligao_negativao";   // 60
  if (dias >= 61 && dias <= 64) return "61_negativao";                 // 61-64
  if (dias >= 65 && dias <= 74) return "65_dias_de_atraso_receber_informe_de_negativao";
  if (dias >= 75 && dias <= 89) return "75_dias_de_atraso_proposta_de_negociao_ps_negativao";
  if (dias >= 90 && dias <= 104) return "90_dias_de_atraso_ligao_para_tentativa_de_negociao_ps_negativao";
  if (dias >= 105 && dias <= 119) return "105_dias_de_atraso_notificao_extra_judicial_altomtico";
  if (dias >= 120 && dias <= 134) return "120_dias_de_atraso_ligao_informe_judicial";
  if (dias >= 135 && dias <= 149) return "135_dias_de_atraso_oferta_de_negativao_automatico";
  if (dias >= 150 && dias <= 179) return "150_dias_de_atraso_enviar_para_o_advogado";
  return "180_dias_ajuizar_manualmente"; // 180+
}

// Quebra um intervalo em janelas de até 30 dias (limite SSótica)
function buildWindows(start: Date, end: Date): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  let cur = new Date(start);
  while (cur <= end) {
    const winEnd = addDays(cur, MAX_WINDOW_DAYS - 1);
    const finalEnd = winEnd > end ? end : winEnd;
    windows.push({ start: ymd(cur), end: ymd(finalEnd) });
    cur = addDays(finalEnd, 1);
  }
  return windows;
}

async function fetchSSotica(
  url: string,
  token: string,
): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SSótica ${res.status}: ${text.slice(0, 300)}`);
  }
  return await res.json();
}

interface Integration {
  id: string;
  company_id: string;
  cnpj: string;
  bearer_token: string;
  initial_sync_done: boolean;
  last_sync_vendas_at: string | null;
  last_sync_receber_at: string | null;
}

async function syncContasReceber(
  supabase: ReturnType<typeof createClient>,
  integ: Integration,
): Promise<{ processed: number; created: number; updated: number }> {
  const today = new Date();
  const startDate = integ.initial_sync_done && integ.last_sync_receber_at
    ? addDays(new Date(integ.last_sync_receber_at), -1)
    : addDays(today, -INITIAL_LOOKBACK_DAYS);
  // janela termina 60 dias à frente para pegar parcelas que vencem em breve
  const endDate = addDays(today, 60);
  const windows = buildWindows(startDate, endDate);

  let processed = 0, created = 0, updated = 0;
  const cnpjClean = integ.cnpj.replace(/\D/g, "");

  for (const w of windows) {
    let page = 1;
    while (true) {
      const url =
        `${SSOTICA_BASE}/financeiro/contas-a-receber/periodo?empresa=${cnpjClean}&inicio_periodo=${w.start}&fim_periodo=${w.end}&page=${page}&perPage=100`;
      const json = await fetchSSotica(url, integ.bearer_token) as {
        currentPage?: number;
        totalPages?: number;
        data?: any[];
      };
      const items: any[] = json.data ?? [];
      if (items.length === 0) break;

      for (const parcela of items) {
        processed++;
        const situacao = String(parcela.situacao ?? parcela["situação"] ?? "").toLowerCase();
        // Só processamos parcelas em aberto / vencidas
        if (situacao !== "em aberto" && situacao !== "em_aberto" && situacao !== "vencido" && situacao !== "vencida") {
          // Se já existe na cobrança e foi paga/cancelada, marcar como paga e seguir
          if (parcela.id && (situacao === "pago" || situacao === "pago_parcial" || situacao === "cancelado")) {
            await supabase
              .from("crm_cobrancas")
              .update({ status: situacao === "pago" ? "pago" : "cancelado" })
              .eq("ssotica_parcela_id", parcela.id);
          }
          continue;
        }

        const vencimento = parcela.vencimento as string | null;
        if (!vencimento) continue;
        const vencDate = new Date(vencimento + "T00:00:00Z");
        const diasAtraso = daysBetween(vencDate, today);

        // Regra: incluir se já venceu OU vence em até 1 dia
        if (diasAtraso < -1) continue;

        const colunaKey = statusKeyForDiasAtraso(diasAtraso);

        const cliente = parcela.cliente ?? {};
        const telefone = cliente.telefone_principal ?? cliente.telefone ?? "";
        const data = {
          nome: cliente.nome ?? "Cliente SSótica",
          telefone,
          documento: cliente.documento ?? cliente.cpf_cnpj ?? "",
          email: cliente.email_principal ?? "",
          numero_documento: parcela.titulo?.numero_documento ?? "",
          descricao: parcela.titulo?.descricao ?? "",
          numero_parcela: parcela.numero_parcela ?? null,
          forma_pagamento: parcela.forma_pagamento ?? "",
          boleto_nosso_numero: parcela.boleto?.nosso_numero ?? null,
          ssotica_raw: parcela,
        };

        // upsert por ssotica_parcela_id
        const { data: existing } = await supabase
          .from("crm_cobrancas")
          .select("id")
          .eq("ssotica_parcela_id", parcela.id)
          .maybeSingle();

        if (existing) {
          // Re-classifica SEMPRE: o card muda de coluna conforme o tempo passa
          await supabase
            .from("crm_cobrancas")
            .update({
              data,
              valor: Number(parcela.valor_reajustado ?? parcela.valor_original ?? 0),
              vencimento,
              dias_atraso: diasAtraso,
              status: colunaKey,
              scheduled_date: vencimento,
            })
            .eq("id", existing.id);
          updated++;
        } else {
          await supabase.from("crm_cobrancas").insert({
            company_id: integ.company_id,
            ssotica_parcela_id: parcela.id,
            ssotica_titulo_id: parcela.titulo?.id ?? null,
            ssotica_cliente_id: cliente.id ?? null,
            ssotica_company_id: integ.company_id,
            data,
            valor: Number(parcela.valor_reajustado ?? parcela.valor_original ?? 0),
            vencimento,
            dias_atraso: diasAtraso,
            status: colunaKey,
            scheduled_date: vencimento,
          });
          created++;
        }
      }

      const totalPages = json.totalPages ?? 1;
      if (page >= totalPages) break;
      page++;
    }
  }

  return { processed, created, updated };
}

async function syncVendas(
  supabase: ReturnType<typeof createClient>,
  integ: Integration,
): Promise<{ processed: number; created: number; updated: number }> {
  const today = new Date();
  const startDate = integ.initial_sync_done && integ.last_sync_vendas_at
    ? addDays(new Date(integ.last_sync_vendas_at), -1)
    : addDays(today, -INITIAL_LOOKBACK_DAYS);
  const endDate = today;
  const windows = buildWindows(startDate, endDate);

  let processed = 0, created = 0, updated = 0;
  const cnpjClean = integ.cnpj.replace(/\D/g, "");

  // Mapa cliente_id -> última venda (data + venda_id + cliente)
  const ultimaCompraPorCliente = new Map<number, { data: string; vendaId: number; cliente: any }>();

  for (const w of windows) {
    const url =
      `${SSOTICA_BASE}/vendas/periodo?cnpj=${cnpjClean}&inicio_periodo=${w.start}&fim_periodo=${w.end}`;
    const vendas = await fetchSSotica(url, integ.bearer_token) as any[];
    if (!Array.isArray(vendas)) continue;

    for (const venda of vendas) {
      processed++;
      if (String(venda.status ?? "").toUpperCase() !== "ATIVA") continue;
      const cliente = venda.cliente;
      if (!cliente?.id) continue;
      const data = venda.data as string;
      const prev = ultimaCompraPorCliente.get(cliente.id);
      if (!prev || prev.data < data) {
        ultimaCompraPorCliente.set(cliente.id, { data, vendaId: venda.id, cliente });
      }
    }
  }

  // Para cada cliente que comprou: se NÃO tem cobrança em aberto/vencida, vai para Renovações
  for (const [clienteId, info] of ultimaCompraPorCliente) {
    // Verifica se há cobrança em aberto/vencida desse cliente nesta loja
    const { data: cobrancasAbertas } = await supabase
      .from("crm_cobrancas")
      .select("id")
      .eq("ssotica_cliente_id", clienteId)
      .eq("ssotica_company_id", integ.company_id)
      .in("status", ["a_vencer", "vencida"])
      .limit(1);

    if (cobrancasAbertas && cobrancasAbertas.length > 0) continue; // tem dívida → não vai pra renovação

    const cliente = info.cliente;
    const telefone = cliente.telefones?.[0]?.numero ?? "";
    const renovacaoData = {
      nome: cliente.nome,
      telefone,
      documento: cliente.cpf_cnpj ?? "",
      email: cliente.emails?.[0]?.email ?? "",
      data_ultima_compra: info.data,
      ssotica_raw: cliente,
    };

    const { data: existing } = await supabase
      .from("crm_renovacoes")
      .select("id, data_ultima_compra")
      .eq("ssotica_cliente_id", clienteId)
      .eq("ssotica_company_id", integ.company_id)
      .maybeSingle();

    if (existing) {
      // Atualiza só se a venda for mais recente
      if (!existing.data_ultima_compra || existing.data_ultima_compra < info.data) {
        await supabase
          .from("crm_renovacoes")
          .update({
            data: renovacaoData,
            data_ultima_compra: info.data,
            ssotica_venda_id: info.vendaId,
            scheduled_date: info.data,
          })
          .eq("id", existing.id);
        updated++;
      }
    } else {
      await supabase.from("crm_renovacoes").insert({
        ssotica_cliente_id: clienteId,
        ssotica_venda_id: info.vendaId,
        ssotica_company_id: integ.company_id,
        data: renovacaoData,
        data_ultima_compra: info.data,
        status: "aguardando_renovacao",
        scheduled_date: info.data,
      });
      created++;
    }
  }

  return { processed, created, updated };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const onlyIntegrationId: string | undefined = body.integration_id;

    const query = supabase
      .from("ssotica_integrations")
      .select("*")
      .eq("is_active", true);
    if (onlyIntegrationId) query.eq("id", onlyIntegrationId);

    const { data: integrations, error: intErr } = await query;
    if (intErr) throw intErr;
    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "Nenhuma integração ativa" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    for (const integ of integrations as Integration[]) {
      const startedAt = new Date().toISOString();
      let logId: string | null = null;
      try {
        await supabase.from("ssotica_integrations").update({ sync_status: "running", last_error: null }).eq("id", integ.id);
        const { data: log } = await supabase.from("ssotica_sync_logs").insert({
          integration_id: integ.id,
          sync_type: "full",
          status: "running",
        }).select("id").single();
        logId = log?.id ?? null;

        // 1. Contas a Receber primeiro (para que Renovações saibam quem tem dívida)
        const cr = await syncContasReceber(supabase, integ);
        // 2. Vendas
        const v = await syncVendas(supabase, integ);

        const finishedAt = new Date().toISOString();
        await supabase.from("ssotica_integrations").update({
          sync_status: "idle",
          last_sync_receber_at: finishedAt,
          last_sync_vendas_at: finishedAt,
          initial_sync_done: true,
          last_error: null,
        }).eq("id", integ.id);

        if (logId) {
          await supabase.from("ssotica_sync_logs").update({
            finished_at: finishedAt,
            status: "success",
            items_processed: cr.processed + v.processed,
            items_created: cr.created + v.created,
            items_updated: cr.updated + v.updated,
            details: { contas_receber: cr, vendas: v },
          }).eq("id", logId);
        }

        results.push({ integration_id: integ.id, ok: true, contas_receber: cr, vendas: v });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[ssotica-sync] integration ${integ.id} failed:`, msg);
        await supabase.from("ssotica_integrations").update({
          sync_status: "error",
          last_error: msg.slice(0, 1000),
        }).eq("id", integ.id);
        if (logId) {
          await supabase.from("ssotica_sync_logs").update({
            finished_at: new Date().toISOString(),
            status: "error",
            error_message: msg.slice(0, 2000),
          }).eq("id", logId);
        }
        results.push({ integration_id: integ.id, ok: false, error: msg });
      }
    }

    return new Response(JSON.stringify({ ok: true, results, started_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ssotica-sync] fatal:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
