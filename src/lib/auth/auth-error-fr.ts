/** Messages GoTrue / Supabase Auth souvent renvoyés en anglais → libellés FR pour l’UI. */
const MAP: Record<string, string> = {
  "invalid login credentials": "Identifiant ou mot de passe incorrect",
  "invalid email or password": "Identifiant ou mot de passe incorrect",
  "email not confirmed": "Adresse e-mail non confirmée — vérifiez votre boîte de réception",
  "user not found": "Aucun compte ne correspond à cet identifiant",
  "signup disabled": "La création de compte est désactivée",
  "email rate limit exceeded": "Trop de tentatives — réessayez dans quelques minutes",
  "too many requests": "Trop de tentatives — réessayez dans quelques minutes",
};

export function authErrorMessageFr(raw: string | undefined | null): string {
  const t = (raw ?? "").trim();
  if (!t) return "Connexion impossible";
  const key = t.toLowerCase();
  return MAP[key] ?? t;
}
