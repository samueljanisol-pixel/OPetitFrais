export const CHAUFFEUR_SETTING_KEY = "chauffeur_user_id";

export type ChauffeurInfo = {
  userId: string;
  prenom: string;
  nom: string;
  phone: string | null;
  displayName: string;
};

export type ChauffeurUserOption = {
  userId: string;
  prenom: string;
  nom: string;
  phone: string | null;
  displayName: string;
};

export function profileDisplayName(prenom: string, nom: string): string {
  const full = `${prenom.trim()} ${nom.trim()}`.trim();
  return full.length > 0 ? full : "—";
}
