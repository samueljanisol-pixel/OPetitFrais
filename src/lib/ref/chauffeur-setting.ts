/** Clé `ref_app_setting` : UUID `profiles.user_id` du chauffeur. */
export const CHAUFFEUR_USER_ID_SETTING_KEY = "chauffeur_user_id";

export type ChauffeurProfile = {
  userId: string;
  prenom: string;
  nom: string;
  phone: string | null;
  displayName: string;
};

export function chauffeurDisplayName(prenom: string, nom: string): string {
  return `${prenom.trim()} ${nom.trim()}`.trim();
}
