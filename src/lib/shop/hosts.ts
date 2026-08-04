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
  const devFallback = "opetitfrais.ma,www.opetitfrais.ma,localhost";
  const prodFallback = "opetitfrais.ma,www.opetitfrais.ma";
  const fallback = process.env.NODE_ENV === "development" ? devFallback : prodFallback;
  return parseHostList(
    process.env.SHOP_HOSTS ?? process.env.NEXT_PUBLIC_SHOP_HOSTS,
    fallback,
  ).map((h) => normalizeHost(h));
}

export function getBackofficeHost(): string {
  return (process.env.BACKOFFICE_HOST ?? "opetitfrais.janisol.ma").trim().toLowerCase();
}

export function isShopHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return getShopHosts().includes(normalizeHost(host));
}

/** Chemins staff : exclus de l’indexation boutique (`robots.txt`). */
export const BACKOFFICE_PATH_PREFIXES = [
  "/admin",
  "/produits",
  "/ca",
  "/historique-ca",
  "/analyse-stats",
  "/boutique",
  "/parametres",
  "/charges",
  "/emballages",
  "/referentiel",
  "/commandes-fournisseur",
  "/cuisine",
  "/notifications",
  "/login",
  "/access-refuse",
] as const;

/** Chemins boutique : sur host backoffice, rediriger vers le domaine shop. */
const SHOP_ONLY_PATHS = ["/livraison"] as const;

/** Aperçu boutique sur localhost sans fichier hosts (`/shop`, dev uniquement). */
export function isShopLocalPreviewPath(pathname: string): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  return pathname === "/shop" || pathname.startsWith("/shop/");
}

export function shopLocalPreviewUrl(pathname = "/shop"): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return path;
}

export function isBackofficeOnlyPath(pathname: string): boolean {
  return BACKOFFICE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isShopOnlyPath(pathname: string): boolean {
  return SHOP_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function backofficeUrl(pathname: string, search = ""): string {
  const host = getBackofficeHost();
  return `https://${host}${pathname}${search}`;
}

/** URL publique de la boutique (nouvel onglet depuis le backoffice). */
export function shopPublicUrl(pathname = "/"): string {
  const hosts = getShopHosts().filter((h) => h !== "localhost" && !h.endsWith(".local"));
  const host = hosts[0] ?? "opetitfrais.ma";
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `https://${host}${path}`;
}
