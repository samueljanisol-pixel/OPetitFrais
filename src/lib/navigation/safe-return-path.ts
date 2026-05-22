/** Chemin interne sûr pour redirection après édition (évite open redirect). */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (raw == null || raw.length === 0) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) {
      return decoded;
    }
  } catch {
    return null;
  }
  return null;
}
