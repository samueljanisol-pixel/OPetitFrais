import type { WorkflowStatus } from "@/lib/commandes-client/workflow";

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  nouvelle: "Nouvelle",
  a_valider: "À valider",
  a_preparer: "À préparer",
  en_preparation: "En préparation",
  a_passer_caisse: "À passer en caisse",
  en_cours_caisse: "En cours à la caisse",
  en_attente_caisse: "En attente en caisse",
  a_livrer: "À livrer",
  a_retirer: "À retirer",
  en_livraison: "En livraison",
  livre_paye: "Livré — Payé",
  livre_espece_a_encaisser: "Livré — Espèce à encaisser",
  livre_non_paye: "Livré — Non payé",
  retire_paye: "Retiré — Payé",
  retire_espece_a_encaisser: "Retiré — Espèce à encaisser",
  retire_compte_client: "Retiré — Compte client",
  annulee: "Annulée",
};

export function workflowStatusLabel(status: WorkflowStatus | null | undefined): string {
  if (status == null) return "—";
  return WORKFLOW_STATUS_LABELS[status] ?? status;
}

export function formatDh(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Montant affiché : total caisse si encaissé, sinon estimation commande. */
export function displayCommandeTotal(item: {
  pos_total?: number | null;
  montant_total?: number | null;
}): number {
  if (item.pos_total != null && Number.isFinite(item.pos_total)) return item.pos_total;
  if (item.montant_total != null && Number.isFinite(item.montant_total)) return item.montant_total;
  return 0;
}

export const LIST_FILTERS: Array<{ key: string; statuses?: WorkflowStatus[] }> = [
  { key: "all" },
  { key: "nouvelle", statuses: ["nouvelle"] },
  { key: "a_valider", statuses: ["a_valider"] },
  { key: "a_preparer", statuses: ["a_preparer", "en_preparation"] },
  { key: "a_passer_caisse", statuses: ["a_passer_caisse", "en_cours_caisse", "en_attente_caisse"] },
  { key: "livraison", statuses: ["a_livrer", "en_livraison"] },
  { key: "retrait", statuses: ["a_retirer"] },
  { key: "terminees", statuses: ["livre_paye", "livre_espece_a_encaisser", "livre_non_paye", "retire_paye", "retire_espece_a_encaisser", "retire_compte_client"] },
  { key: "annulees", statuses: ["annulee"] },
];
