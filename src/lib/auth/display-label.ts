import type { SessionPayload } from "@/lib/auth/session-types";

/** Construit le libellé affiché dans l’en-tête (serveur + client si cache ancien). */
export function buildSessionDisplayLabel(
  input: Pick<SessionPayload, "prenom" | "nom" | "login" | "email" | "roleName" | "userId"> & {
    displayLabel?: string;
  },
  userMetadata?: Record<string, unknown> | null,
): string {
  if (input.displayLabel?.trim()) return input.displayLabel.trim();

  const metaStr = (k: string) => {
    const v = userMetadata?.[k];
    if (v == null) return "";
    return String(v).trim();
  };

  const full = `${input.prenom ?? ""} ${input.nom ?? ""}`.trim();
  if (full) return full;

  const fromMeta =
    metaStr("full_name") || metaStr("name") || metaStr("preferred_username");
  if (fromMeta) return fromMeta;

  if (input.login?.trim()) return input.login.trim();

  const em = input.email?.trim() ?? "";
  if (em && !em.endsWith("@internal.opf")) return em;

  if (em.endsWith("@internal.opf")) {
    const local = em.split("@")[0] ?? "";
    if (local && !/^[0-9a-f-]{36}$/i.test(local)) return local;
  }

  if (input.roleName?.trim()) return input.roleName.trim();

  if (input.userId) return "Compte";

  return "Utilisateur";
}
