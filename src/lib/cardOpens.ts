import { supabase } from "@/integrations/supabase/client";

/**
 * Registers that a salesperson opened a card for editing.
 * Each call generates a unique identifier (the row id), used to
 * compute "atendimentos" in the daily dashboard report.
 *
 * Errors are intentionally swallowed so a network/RLS issue never
 * blocks the user from editing the card.
 */
export async function recordCardOpen(params: {
  userId: string;
  cardType: "lead" | "renovacao";
  leadId?: string | null;
  renovacaoId?: string | null;
}): Promise<void> {
  if (!params.userId) return;
  if (params.cardType === "lead" && !params.leadId) return;
  if (params.cardType === "renovacao" && !params.renovacaoId) return;

  try {
    await supabase.from("lead_card_opens").insert({
      user_id: params.userId,
      card_type: params.cardType,
      lead_id: params.cardType === "lead" ? params.leadId ?? null : null,
      renovacao_id: params.cardType === "renovacao" ? params.renovacaoId ?? null : null,
    });
  } catch (err) {
    // Non-blocking
    console.warn("recordCardOpen failed", err);
  }
}
