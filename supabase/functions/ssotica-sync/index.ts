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
const DIRECIONAMENTO_STATUS = "fazer_direcionamento_para_o_vendedor";

type AppRole = "admin" | "vendedor" | "gerente" | "financeiro";

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

// Mapeia dias desde a última compra para a key da coluna em crm_renovacao_statuses.
// Re-classifica sempre (a cada sync) para acompanhar a passagem do tempo.
function statusKeyForRenovacao(diasDesdeUltimaCompra: number | null): string {
  if (diasDesdeUltimaCompra === null) return "novo";        // sem data = informações insuficientes
  if (diasDesdeUltimaCompra < 365) return "em_contato";     // menos de 1 ano
  if (diasDesdeUltimaCompra < 730) return "agendado";       // 1 a 2 anos
  if (diasDesdeUltimaCompra < 1095) return "renovado";      // 2 a 3 anos
  return "mais_de_3_anos";                                  // 3+ anos
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
  license_code: string | null;
  bearer_token: string;
  initial_sync_done: boolean;
  last_sync_vendas_at: string | null;
  last_sync_receber_at: string | null;
}

type CompanyProfile = {
  user_id: string;
  full_name: string;
};

type CompanyRole = {
  user_id: string;
  role: AppRole;
};

type ExistingCobranca = {
  id: string;
  vencimento: string | null;
  ssotica_parcela_id: number | null;
};

type ExistingRenovacao = {
  id: string;
  data_ultima_compra: string | null;
  status: string;
  assigned_to: string | null;
};

type StoredCobranca = {
  id: string;
  ssotica_parcela_id: number | null;
  ssotica_cliente_id: number | null;
};

// Normaliza um valor para usar nas APIs do SSótica.
// Para CNPJ: remove pontuação. Para código de licença: mantém como está.
function normalizeIdentifier(value: string): string {
  const raw = (value ?? "").trim();
  const onlyDigits = raw.replace(/\D/g, "");
  const isCnpj = !/[a-zA-Z]/.test(raw) && onlyDigits.length === 14;
  return isCnpj ? onlyDigits : raw;
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSamePerson(nameA: unknown, nameB: unknown): boolean {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

async function syncContasReceber(
  supabase: any,
  integ: Integration,
): Promise<{ processed: number; created: number; updated: number; removed: number }> {
  const today = new Date();
  // SEMPRE buscar 180 dias para trás para garantir que parcelas em atraso antigas sejam pegas.
  // Não usar last_sync_receber_at aqui porque parcelas vencidas há muito tempo continuam ativas
  // até serem pagas, e podem não aparecer em janelas curtas se o sync rodar todos os dias.
  const startDate = addDays(today, -INITIAL_LOOKBACK_DAYS);
  // janela termina 60 dias à frente para pegar parcelas que vencem em breve
  const endDate = addDays(today, 60);
  const windows = buildWindows(startDate, endDate);

  let processed = 0, created = 0, updated = 0, removed = 0;
  // Contadores de diagnóstico (logados ao final para depurar filtros)
  const skipped = {
    naoAtiva: 0,
    renegociada: 0,
    baixada: 0,
    cancelada: 0,
    estornada: 0,
    paga: 0,
    semVencimento: 0,
    naoEmAtraso: 0,
    semCliente: 0,
  };
  const situacoesVistas = new Map<string, number>();
  // Contas a Receber: usa o Código de Licença se disponível, senão usa o CNPJ.
  const empresaParam = normalizeIdentifier(integ.license_code || integ.cnpj);

  // Atribui novas cobranças à Brenda automaticamente (responsável padrão por cobranças)
  const { data: brendaProfile } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("full_name", "brenda%")
    .maybeSingle();
  const defaultAssignee: string | null = (brendaProfile as any)?.user_id ?? null;

  // Coletamos IDs de parcelas que ainda estão em aberto/vencidas neste sync.
  // Usamos para detectar cobranças do banco que sumiram da API (foram pagas).
  const parcelasAtivasIds = new Set<number>();
  const clientesAfetados = new Set<number>();

  for (const w of windows) {
    let page = 1;
    while (true) {
      const url =
        `${SSOTICA_BASE}/financeiro/contas-a-receber/periodo?empresa=${encodeURIComponent(empresaParam)}&inicio_periodo=${w.start}&fim_periodo=${w.end}&page=${page}&perPage=100`;
      const json = await fetchSSotica(url, integ.bearer_token) as {
        currentPage?: number;
        totalPages?: number;
        data?: any[];
      };
      const items: any[] = json.data ?? [];
      if (items.length === 0) break;

      for (const parcela of items) {
        processed++;
        // Normaliza situação: remove acentos, lowercase, troca espaço/underscore
        const situacaoRaw = String(parcela.situacao ?? parcela["situação"] ?? "");
        const situacao = situacaoRaw
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[\s_-]+/g, " ")
          .trim();
        situacoesVistas.set(situacao, (situacoesVistas.get(situacao) ?? 0) + 1);

        // Situações ATIVAS (parcela ainda devida e SEM renegociação) = mantemos no kanban de cobranças
        // "Renegociado" significa que a dívida virou um novo título — não é mais cobrança em atraso,
        // o cliente deve ser tratado pela tela de Renovação.
        const isAtiva =
          situacao === "em aberto" ||
          situacao === "vencido" ||
          situacao === "vencida";

        // Detecta renegociação por DOIS sinais (qualquer um basta):
        //  1) campo `situacao` começa com "renegoc" (Renegociado, Renegociada, etc.)
        //  2) objeto `renegociacao` preenchido na parcela (id != null)
        const renegociacaoObj = parcela.renegociacao ?? parcela.renegociacao_info ?? null;
        const temObjetoRenegociacao =
          !!renegociacaoObj &&
          typeof renegociacaoObj === "object" &&
          !Array.isArray(renegociacaoObj) &&
          (renegociacaoObj.id != null || renegociacaoObj.valor_renegociacao != null);
        const foiRenegociada = situacao.startsWith("renegoc") || temObjetoRenegociacao;

        // Sinais de que a parcela JÁ FOI QUITADA (não é mais dívida)
        const foiBaixada = !!parcela.baixado_em;
        const foiCancelada = !!parcela.cancelado_em;
        const foiEstornada = !!parcela.estornado_em;
        const dataPagamento = parcela.data_pagamento ?? parcela.dataPagamento ?? null;
        const valorRecebido = Number(parcela.valor_recebido ?? parcela.valorRecebido ?? 0);
        const valorParcela = Number(parcela.valor ?? 0);
        const foiPaga =
          !!dataPagamento ||
          situacao === "pago" ||
          situacao === "paga" ||
          situacao === "quitado" ||
          situacao === "quitada" ||
          situacao === "liquidado" ||
          situacao === "liquidada" ||
          (valorParcela > 0 && valorRecebido >= valorParcela);

        // Conta motivos de skip (em ordem de prioridade)
        if (!isAtiva) skipped.naoAtiva++;
        else if (foiRenegociada) skipped.renegociada++;
        else if (foiBaixada) skipped.baixada++;
        else if (foiCancelada) skipped.cancelada++;
        else if (foiEstornada) skipped.estornada++;
        else if (foiPaga) skipped.paga++;

        const isInativa =
          !isAtiva || foiRenegociada || foiBaixada || foiCancelada || foiEstornada || foiPaga;

        if (isInativa) {
          // Marca cliente para reclassificação (a parcela em si é tratada no pós-processamento)
          const cliInativa = parcela.titulo?.cliente ?? parcela.cliente ?? {};
          if (cliInativa?.id) clientesAfetados.add(Number(cliInativa.id));
          continue;
        }

        const vencimento = parcela.vencimento as string | null;
        if (!vencimento) { skipped.semVencimento++; continue; }
        const vencDate = new Date(vencimento + "T00:00:00Z");
        const diasAtraso = daysBetween(vencDate, today);

        // Regra: SÓ incluir parcelas REALMENTE em atraso (venceu ontem ou antes)
        if (diasAtraso < 1) { skipped.naoEmAtraso++; continue; }

        if (parcela.id) parcelasAtivasIds.add(Number(parcela.id));

        const colunaKey = statusKeyForDiasAtraso(diasAtraso);

        // O cliente vem dentro de parcela.titulo.cliente (não direto em parcela.cliente)
        const cliente = parcela.titulo?.cliente ?? parcela.cliente ?? {};
        if (cliente?.id) clientesAfetados.add(Number(cliente.id));
        const telefone = cliente.telefone_principal ?? cliente.telefone ?? "";
        const documento = cliente.documento ?? cliente.cpf_cnpj ?? cliente.cpf ?? "";
        const data = {
          nome: cliente.nome ?? "Cliente SSótica",
          telefone,
          documento,
          cpf: documento,
          email: cliente.email_principal ?? cliente.email ?? "",
          numero_documento: parcela.titulo?.numero_documento ?? "",
          descricao: parcela.titulo?.descricao ?? "",
          numero_parcela: parcela.numero_parcela ?? null,
          forma_pagamento: parcela.forma_pagamento ?? "",
          boleto_nosso_numero: parcela.boleto?.nosso_numero ?? null,
          ssotica_raw: parcela,
        };

        // === 1 card por cliente: upsert por (ssotica_company_id, ssotica_cliente_id) ===
        // Mantemos sempre os dados da parcela MAIS ANTIGA em atraso para esse cliente.
        if (!cliente?.id) { skipped.semCliente++; continue; }

        const { data: existing } = await supabase
          .from("crm_cobrancas")
          .select("id, vencimento, ssotica_parcela_id")
          .eq("ssotica_company_id", integ.company_id)
          .eq("ssotica_cliente_id", cliente.id)
          .maybeSingle();
        const existingCobranca = existing as ExistingCobranca | null;

        if (existingCobranca) {
          // Só atualiza para essa parcela se ela for mais antiga (ou igual) à atualmente armazenada
          const existingVencDate = existingCobranca.vencimento
            ? new Date(existingCobranca.vencimento + "T00:00:00Z").getTime()
            : Number.POSITIVE_INFINITY;
          const novaVencTime = vencDate.getTime();

          if (novaVencTime <= existingVencDate) {
            await supabase
              .from("crm_cobrancas")
              .update({
                ssotica_parcela_id: parcela.id ?? null,
                ssotica_titulo_id: parcela.titulo?.id ?? null,
                data,
                valor: Number(parcela.valor_reajustado ?? parcela.valor_original ?? 0),
                vencimento,
                dias_atraso: diasAtraso,
                status: colunaKey,
                scheduled_date: vencimento,
              })
              .eq("id", existingCobranca.id);
            updated++;
          }
        } else {
          await supabase.from("crm_cobrancas").insert({
            company_id: integ.company_id,
            ssotica_parcela_id: parcela.id ?? null,
            ssotica_titulo_id: parcela.titulo?.id ?? null,
            ssotica_cliente_id: cliente.id ?? null,
            ssotica_company_id: integ.company_id,
            assigned_to: defaultAssignee,
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

  // ===== Pós-processamento: remover cards de clientes que não têm mais nenhuma parcela em atraso =====
  // Como agora há apenas 1 card por cliente, basta remover cards cuja parcela atual não esteja mais ativa
  // E que não tenham sido atualizados nesta sync (cliente sem nenhuma parcela ativa).
  const { data: cobrancasNoBanco } = await supabase
    .from("crm_cobrancas")
    .select("id, ssotica_parcela_id, ssotica_cliente_id")
    .eq("ssotica_company_id", integ.company_id)
    .not("ssotica_cliente_id", "is", null);
  const storedCobrancas = (cobrancasNoBanco ?? []) as StoredCobranca[];

  if (storedCobrancas.length > 0) {
    for (const cob of storedCobrancas) {
      const parcelaId = cob.ssotica_parcela_id ? Number(cob.ssotica_parcela_id) : null;
      const clienteId = Number(cob.ssotica_cliente_id);
      // Se a parcela atual ainda está ativa OU o cliente foi atualizado nesta sync, mantém
      if (parcelaId && parcelasAtivasIds.has(parcelaId)) continue;
      if (clientesAfetados.has(clienteId)) continue;
      // Cliente sumiu da API → remove o card
      await supabase.from("crm_cobrancas").delete().eq("id", cob.id);
      removed++;
    }
  }

  // Log de diagnóstico para entender por que parcelas estão sendo filtradas
  const topSituacoes = Array.from(situacoesVistas.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log(`[ssotica-sync][cobrancas] empresa=${integ.company_id} processed=${processed} created=${created} updated=${updated} removed=${removed} skipped=${JSON.stringify(skipped)} top_situacoes=${JSON.stringify(topSituacoes)}`);

  return { processed, created, updated, removed };
}

async function syncVendas(
  supabase: any,
  integ: Integration,
): Promise<{ processed: number; created: number; updated: number }> {
  const today = new Date();
  const startDate = integ.initial_sync_done && integ.last_sync_vendas_at
    ? addDays(new Date(integ.last_sync_vendas_at), -1)
    : addDays(today, -INITIAL_LOOKBACK_DAYS);
  const endDate = today;
  const windows = buildWindows(startDate, endDate);

  let processed = 0, created = 0, updated = 0;
  // Vendas: SEMPRE usa o CNPJ puro (não aceita código de licença).
  const cnpjVendas = normalizeIdentifier(integ.cnpj);

  const { data: companyProfiles } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .eq("company_id", integ.company_id);
  const typedCompanyProfiles = (companyProfiles ?? []) as CompanyProfile[];

  const companyUserIds = typedCompanyProfiles.map((profile) => profile.user_id);
  const { data: companyRoles } = companyUserIds.length > 0
    ? await supabase.from("user_roles").select("user_id, role").in("user_id", companyUserIds)
    : { data: [] as Array<{ user_id: string; role: AppRole }> };
  const typedCompanyRoles = (companyRoles ?? []) as CompanyRole[];

  const roleByUserId = new Map<string, AppRole>(
    typedCompanyRoles.map((entry) => [entry.user_id, entry.role]),
  );
  const managerUserId = typedCompanyProfiles.find((profile) => roleByUserId.get(profile.user_id) === "gerente")?.user_id ?? null;
  const findResponsibleProfile = (responsavelNome: string | null | undefined) => {
    if (!responsavelNome) return null;

    return typedCompanyProfiles.find(
      (profile) => roleByUserId.get(profile.user_id) === "vendedor" && isSamePerson(profile.full_name, responsavelNome),
    ) ?? typedCompanyProfiles.find((profile) => isSamePerson(profile.full_name, responsavelNome)) ?? null;
  };

  // Mapa cliente_id -> última venda (data + venda_id + valor + cliente)
  const ultimaCompraPorCliente = new Map<number, { data: string; vendaId: number; valor: number; cliente: any; funcionario: any }>();

  for (const w of windows) {
    const url =
      `${SSOTICA_BASE}/vendas/periodo?cnpj=${encodeURIComponent(cnpjVendas)}&inicio_periodo=${w.start}&fim_periodo=${w.end}`;
    const vendas = await fetchSSotica(url, integ.bearer_token) as any[];
    if (!Array.isArray(vendas)) continue;

    for (const venda of vendas) {
      processed++;
      if (String(venda.status ?? "").toUpperCase() !== "ATIVA") continue;
      const cliente = venda.cliente;
      if (!cliente?.id) continue;
      const data = venda.data as string;
      const valor = Number(venda.valor_liquido ?? venda.valor_bruto ?? 0);
      const prev = ultimaCompraPorCliente.get(cliente.id);
      if (!prev || prev.data < data) {
        ultimaCompraPorCliente.set(cliente.id, { data, vendaId: venda.id, valor, cliente, funcionario: venda.funcionario ?? null });
      }
    }
  }

  // Para cada cliente que comprou: se NÃO tem cobrança em aberto/vencida, vai para Renovações
  for (const [clienteId, info] of ultimaCompraPorCliente) {
    // Verifica se há cobrança em aberto desse cliente nesta loja
    // (qualquer status que não seja pago/cancelado conta como dívida pendente)
    const { data: cobrancasAbertas } = await supabase
      .from("crm_cobrancas")
      .select("id")
      .eq("ssotica_cliente_id", clienteId)
      .eq("ssotica_company_id", integ.company_id)
      .not("status", "in", "(pago,cancelado)")
      .limit(1);

    if (cobrancasAbertas && cobrancasAbertas.length > 0) continue; // tem dívida → não vai pra renovação

    const cliente = info.cliente;
    const telefone = cliente.telefones?.[0]?.numero ?? "";
    const responsavelNome = info.funcionario?.nome ?? "";
    const responsavelFuncao = info.funcionario?.funcao ?? "";
    const renovacaoData = {
      nome: cliente.nome,
      telefone,
      documento: cliente.cpf_cnpj ?? "",
      email: cliente.emails?.[0]?.email ?? "",
      data_ultima_compra: info.data,
      responsavel_ssotica_nome: responsavelNome,
      responsavel_ssotica_funcao: responsavelFuncao,
      ssotica_raw: cliente,
    };

    // Calcula dias desde a última compra para escolher a coluna
    const ultimaCompraDate = new Date(info.data + "T00:00:00Z");
    const diasDesdeUltimaCompra = daysBetween(ultimaCompraDate, today);
    const { data: existing } = await supabase
      .from("crm_renovacoes")
      .select("id, data_ultima_compra, status, assigned_to")
      .eq("ssotica_cliente_id", clienteId)
      .eq("ssotica_company_id", integ.company_id)
      .maybeSingle();
    const existingRenovacao = existing as ExistingRenovacao | null;

    const matchedProfile = findResponsibleProfile(responsavelNome);
    const existingAssignedRole = existingRenovacao?.assigned_to ? roleByUserId.get(existingRenovacao.assigned_to) : null;
    const preserveExistingVendedor = existingAssignedRole === "vendedor";
    const resolvedAssignedTo = preserveExistingVendedor
      ? existingRenovacao?.assigned_to ?? null
      : matchedProfile?.user_id ?? managerUserId ?? existingRenovacao?.assigned_to ?? null;
    const resolvedAssignedRole = resolvedAssignedTo ? roleByUserId.get(resolvedAssignedTo) : null;
    const hasAssignedVendedor = resolvedAssignedRole === "vendedor";
    const flowStatus = statusKeyForRenovacao(diasDesdeUltimaCompra);

    if (existingRenovacao) {
      // Não mexe se vendedor já está atendendo manualmente
      const isManualStatus = existingRenovacao.status === "em_atendimento" || existingRenovacao.status === "nunca_fez_exame";
      const newStatus = !hasAssignedVendedor
        ? DIRECIONAMENTO_STATUS
        : isManualStatus
          ? existingRenovacao.status
          : flowStatus;
      // Atualiza se a venda é mais recente OU se o status precisa mudar de coluna pelo tempo
      const vendaMaisRecente = !existingRenovacao.data_ultima_compra || existingRenovacao.data_ultima_compra < info.data;
      const statusMudou = existingRenovacao.status !== newStatus;
      const assignedMudou = (existingRenovacao.assigned_to ?? null) !== resolvedAssignedTo;
      if (vendaMaisRecente || statusMudou || assignedMudou) {
        await supabase
          .from("crm_renovacoes")
          .update({
            data: renovacaoData,
            data_ultima_compra: info.data,
            ssotica_venda_id: info.vendaId,
            assigned_to: resolvedAssignedTo,
            valor: info.valor,
            scheduled_date: info.data,
            status: newStatus,
          })
          .eq("id", existingRenovacao.id);
        updated++;
      }
    } else {
      await supabase.from("crm_renovacoes").insert({
        ssotica_cliente_id: clienteId,
        ssotica_venda_id: info.vendaId,
        ssotica_company_id: integ.company_id,
        assigned_to: resolvedAssignedTo,
        data: renovacaoData,
        data_ultima_compra: info.data,
        valor: info.valor,
        status: hasAssignedVendedor ? flowStatus : DIRECIONAMENTO_STATUS,
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
