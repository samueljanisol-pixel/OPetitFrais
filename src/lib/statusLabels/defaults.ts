/** Libellés par défaut (si la table `ref_status_label` est vide ou ligne manquante). */
export const FALLBACK_STATUS_LABELS: Record<string, Record<string, string>> = {
  commande_fournisseur: {
    en_saisie: "En saisie",
    validee: "Validée",
    integree: "Intégrée",
    annulee: "Annulée",
  },
  commande_fournisseur_lot: {
    brouillon: "Brouillon",
    prevalidation: "Prévalidation",
    prete: "Prête",
    achat_en_cours: "Achat en cours",
    terminee: "Terminée",
  },
};

export function fallbackStatusLabel(domain: string, code: string): string {
  const d = FALLBACK_STATUS_LABELS[domain];
  const l = d?.[code];
  if (l) return l;
  return code;
}
