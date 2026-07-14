/** Domaines boutique publique (opetitfrais.ma). Configurable via SHOP_HOSTS / NEXT_PUBLIC_SHOP_HOSTS. */

function parseHostList(raw: string | undefined, fallback: string): string[] {
  const value = raw?.trim() || fallback;
  return value
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeHost(host: string): string {
  return host.split(":")[0].trim().toLowerCase();
}

export function getShopHosts(): string[] {
  return parseHostList(
    process.env.SHOP_HOSTS ?? process.env.NEXT_PUBLIC_SHOP_HOSTS,
    "opetitfrais.ma,www.opetitfrais.ma",
  );
}

export function getBackofficeHost(): string {
  return (process.env.BACKOFFICE_HOST ?? "opetitfrais.janisol.ma").trim().toLowerCase();
}

export function isShopHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return getShopHosts().includes(normalizeHost(host));
}

const BACKOFFICE_PATH_PREFIXES = [
  "/admin",
  "/produits",
  "/ca",
  "/historique-ca",
  "/analyse-stats",
  "/referentiel",
  "/commandes-fournisseur",
  "/cuisine",
  "/notifications",
  "/login",
  "/access-refuse",
] as const;

export function isBackofficeOnlyPath(pathname: string): boolean {
  return BACKOFFICE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function backofficeUrl(pathname: string, search = ""): string {
  const host = getBackofficeHost();
  return `https://${host}${pathname}${search}`;
}
