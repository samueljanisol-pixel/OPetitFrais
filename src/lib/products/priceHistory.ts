import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Enregistre un instantané vente/achat dans l’historique.
 * (Le trigger base est retiré : fiabilité via la politique RLS `authenticated`.)
 */
export async function insertProductPriceHistoryRow(
  supabase: SupabaseClient,
  args: { product_id: string; price: number; cost_purchase: number | null },
) {
  return supabase.from('product_price_history').insert({
    product_id: args.product_id,
    price: args.price,
    cost_purchase: args.cost_purchase,
  } as never)
}
