/** Codes d'erreur Supabase Auth → clés i18n `backoffice.auth.errors.*` */
const MAP: Record<string, string> = {
  "invalid login credentials": "invalid_credentials",
  "invalid email or password": "invalid_credentials",
  "email not confirmed": "email_not_confirmed",
  "user not found": "user_not_found",
  "signup disabled": "signup_disabled",
  "email rate limit exceeded": "rate_limit",
  "too many requests": "rate_limit",
};

export function authErrorCode(raw: string | undefined | null): string {
  const t = (raw ?? "").trim();
  if (!t) return "connection_failed";
  const key = MAP[t.toLowerCase()];
  return key ?? "unknown";
}

/** Messages FR legacy pour les réponses API sans client i18n. */
export function authErrorMessageFr(raw: string | undefined | null): string {
  const code = authErrorCode(raw);
  const FR: Record<string, string> = {
    invalid_credentials: "Identifiant ou mot de passe incorrect",
    email_not_confirmed: "Adresse e-mail non confirmée — vérifiez votre boîte de réception",
    user_not_found: "Aucun compte ne correspond à cet identifiant",
    signup_disabled: "La création de compte est désactivée",
    rate_limit: "Trop de tentatives — réessayez dans quelques minutes",
    connection_failed: "Connexion impossible",
    unknown: (raw ?? "").trim() || "Connexion impossible",
  };
  return FR[code] ?? FR.unknown;
}
