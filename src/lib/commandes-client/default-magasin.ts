/** Magasin par défaut pour les commandes client boutique (validation / préparation). */
export const DEFAULT_COMMANDE_CLIENT_MAGASIN_CODE = "M02";

export type MagasinOption = { id: string; code: string; nom: string };

export function resolveDefaultMagasinId(
  magasins: MagasinOption[],
  currentId?: string | null,
): string {
  if (currentId && magasins.some((m) => m.id === currentId)) return currentId;
  const preferred = magasins.find((m) => m.code === DEFAULT_COMMANDE_CLIENT_MAGASIN_CODE);
  if (preferred) return preferred.id;
  return magasins[0]?.id ?? "";
}
