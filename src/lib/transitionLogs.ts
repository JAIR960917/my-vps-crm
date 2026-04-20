import { supabase } from "@/integrations/supabase/client";

export type ModuleName = "renovacao" | "cobranca" | "none";

export type LogTransitionParams = {
  cliente_nome: string;
  from_module: ModuleName;
  to_module: ModuleName;
  to_status_key?: string | null;
  to_status_label?: string | null;
  source_record_id?: string | null;
  target_record_id?: string | null;
  company_id?: string | null;
  ssotica_cliente_id?: number | null;
  triggered_by?: string | null;
  trigger_source?: string;
};

/**
 * Registra um evento de movimentação na tabela crm_module_transition_logs.
 * Convenção:
 *  - Criação manual: from_module = "none", to_module = "renovacao" | "cobranca"
 *  - Exclusão manual: from_module = "renovacao" | "cobranca", to_module = "none"
 *  - Transição entre módulos: from/to são os módulos reais
 */
export async function logTransition(params: LogTransitionParams) {
  try {
    const triggerSource = params.trigger_source ?? "manual";
    // Para logs manuais, garante que triggered_by seja o usuário corrente
    // (RLS exige isso desde a correção de segurança).
    let triggeredBy: string | null = params.triggered_by ?? null;
    if (triggerSource === "manual" && !triggeredBy) {
      const { data: userData } = await supabase.auth.getUser();
      triggeredBy = userData?.user?.id ?? null;
    }

    await (supabase as any).from("crm_module_transition_logs").insert({
      cliente_nome: params.cliente_nome || "Cliente",
      from_module: params.from_module,
      to_module: params.to_module,
      to_status_key: params.to_status_key ?? null,
      to_status_label: params.to_status_label ?? null,
      source_record_id: params.source_record_id ?? null,
      target_record_id: params.target_record_id ?? null,
      company_id: params.company_id ?? null,
      ssotica_cliente_id: params.ssotica_cliente_id ?? null,
      triggered_by: triggeredBy,
      trigger_source: triggerSource,
    });
  } catch (e) {
    console.error("[transition-log] erro ao registrar:", e);
  }
}

/** Busca o label de uma coluna a partir de sua key (renovacao ou cobranca). */
export async function getStatusLabel(
  module: "renovacao" | "cobranca",
  key: string,
): Promise<string | null> {
  try {
    const table = module === "renovacao" ? "crm_renovacao_statuses" : "crm_cobranca_statuses";
    const { data } = await (supabase as any).from(table).select("label").eq("key", key).maybeSingle();
    return (data as any)?.label ?? null;
  } catch {
    return null;
  }
}
