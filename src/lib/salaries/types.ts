export type SalariePaiementKind = "salaire" | "avance";
export type SalarieEvenementKind = "malade" | "conge" | "autre";
export type SalariePlanningKind = "travail" | "repos" | "malade" | "conge";

export type SalarieRow = {
  id: string;
  magasin_id: string;
  nom: string | null;
  prenom: string;
  date_arrivee: string;
  date_depart: string | null;
  notes: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SalarieListItem = SalarieRow & {
  magasin_nom?: string;
  magasin_code?: string;
  magasin_type?: string | null;
  actif: boolean;
};

export type SalarieDocumentRow = {
  id: string;
  salarie_id: string;
  label: string;
  storage_path: string;
  mime_type: string | null;
  url: string | null;
  created_at: string;
};

export type SalariePaiementRow = {
  id: string;
  salarie_id: string;
  kind: SalariePaiementKind;
  montant: number;
  date_paiement: string;
  payment_method_id: string | null;
  payment_method_label: string | null;
  commentaire: string | null;
  created_at: string;
};

export type SalariePaiementSummary = {
  total_salaires: number;
  total_avances: number;
  /** Salaires versés moins avances (positif = net versé au-delà des avances). */
  solde: number;
};

export type SalarieEvenementRow = {
  id: string;
  salarie_id: string;
  kind: SalarieEvenementKind;
  date_debut: string;
  date_fin: string;
  commentaire: string | null;
  created_at: string;
};

export type SalarieHoraireRow = {
  id: string;
  salarie_id: string;
  day_of_week: number;
  is_repos: boolean;
  heure_debut: string | null;
  heure_fin: string | null;
};

export type SalariePlanningShiftRow = {
  id: string;
  salarie_id: string;
  semaine: string;
  day_of_week: number;
  kind: SalariePlanningKind;
  heure_debut: string | null;
  heure_fin: string | null;
};

export type PlanningSalarieRow = {
  id: string;
  nom: string | null;
  prenom: string;
  date_depart: string | null;
  shifts: SalariePlanningShiftRow[];
  horaires: SalarieHoraireRow[];
};

export type HoraireInput =
  | { day_of_week: number; is_repos: true }
  | {
      day_of_week: number;
      is_repos: false;
      heure_debut: string;
      heure_fin: string;
    };

export type PlanningShiftInput =
  | {
      salarie_id: string;
      semaine: string;
      day_of_week: number;
      kind: "repos" | "malade" | "conge";
    }
  | {
      salarie_id: string;
      semaine: string;
      day_of_week: number;
      kind: "travail";
      heure_debut: string;
      heure_fin: string;
    };

export const DAY_LABELS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
