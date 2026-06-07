export type SessionMagasin = {
  id: string;
  code: string;
  nom: string;
};

export type SessionPayload = {
  userId: string | null;
  email: string | null;
  login: string | null;
  prenom: string;
  nom: string;
  roleId: string | null;
  roleName: string | null;
  roleSlug: string | null;
  isFullAccess: boolean;
  permissions: string[];
  /** Magasins visibles (profile_magasins ou tous si administrateur / accès total sans lien). */
  magasins: SessionMagasin[];
  /** true si le périmètre magasin vient de profile_magasins (restriction explicite). */
  magasinsRestricted?: boolean;
  /** Libellé unique pour l'en-tête (pré-calculé côté API session). */
  displayLabel: string;
  uiLocale?: "fr" | "ar-MA";
};
