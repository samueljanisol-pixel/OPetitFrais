/** Permission requise pour un chemin (ordre : du plus spécifique au plus général). */

export type PathRequirement = string | { anyOf: string[] } | null;

export type RouteRule = { match: (path: string) => boolean; permission: PathRequirement };

const rules: RouteRule[] = [
  { match: (p) => p === "/access-refuse", permission: null },
  { match: (p) => p.startsWith("/admin/roles"), permission: "admin.roles" },
  { match: (p) => p.startsWith("/admin/utilisateurs"), permission: "admin.utilisateurs" },
  { match: (p) => p.startsWith("/admin"), permission: "admin.utilisateurs" },
  { match: (p) => p.startsWith("/produits/nouveau"), permission: "produits.write" },
  {
    match: (p) => p.startsWith("/produits/actualisation"),
    permission: { anyOf: ["produits.write", "commandes_fournisseur.achat"] },
  },
  { match: (p) => p.startsWith("/produits/") && p !== "/produits/", permission: "produits.read" },
  { match: (p) => p.startsWith("/produits"), permission: "produits.read" },
  { match: (p) => p.startsWith("/boutique/stats"), permission: "shop.read" },
  { match: (p) => p.startsWith("/historique-ca") || p.startsWith("/ca") || p.startsWith("/analyse-stats"), permission: "ventes.read" },
  { match: (p) => p.startsWith("/parametres"), permission: "parametres.read" },
  { match: (p) => p.startsWith("/salaries/planning"), permission: "salaries.read" },
  { match: (p) => p.startsWith("/salaries"), permission: "salaries.read" },
  { match: (p) => p.startsWith("/charges"), permission: "charges.read" },
  { match: (p) => p.startsWith("/emballages"), permission: "emballages.read" },
  {
    match: (p) => p.startsWith("/commandes-fournisseur/comptes"),
    permission: "commandes_fournisseur.comptes",
  },
  {
    match: (p) => p.startsWith("/commandes-fournisseur/achat"),
    permission: "commandes_fournisseur.achat",
  },
  {
    match: (p) =>
      p.startsWith("/commandes-fournisseur/consolidation") ||
      p.startsWith("/commandes-fournisseur/validation"),
    permission: "commandes_fournisseur.consolidation",
  },
  {
    match: (p) => p.startsWith("/commandes-fournisseur/saisie"),
    permission: "commandes_fournisseur.saisie",
  },
  {
    match: (p) => p === "/commandes-fournisseur" || p === "/commandes-fournisseur/",
    permission: {
      anyOf: [
        "commandes_fournisseur.saisie",
        "commandes_fournisseur.consolidation",
        "commandes_fournisseur.achat",
        "commandes_fournisseur.comptes",
      ],
    },
  },
  { match: (p) => p.startsWith("/cuisine/historique"), permission: "cuisine.historique" },
  { match: (p) => p.startsWith("/cuisine/saisie"), permission: "cuisine.saisie" },
  {
    match: (p) => p === "/cuisine" || p === "/cuisine/",
    permission: { anyOf: ["cuisine.saisie", "cuisine.historique"] },
  },
  { match: (p) => p.startsWith("/notifications"), permission: null },
  { match: (p) => p === "/", permission: null },
];

/** Dernière règle qui matche, ou `undefined` si aucune (accès autorisé par défaut). */
export function requiredPermissionForPath(pathname: string): PathRequirement | undefined {
  for (const r of rules) {
    if (r.match(pathname)) return r.permission;
  }
  return undefined;
}

function pathMatchesRequirement(
  keys: Set<string>,
  need: PathRequirement,
): boolean {
  if (need === null) return true;
  if (typeof need === "string") return keys.has(need);
  return need.anyOf.some((k) => keys.has(k));
}

export function canAccessPath(pathname: string, keys: Set<string>, isFullAccess: boolean): boolean {
  if (isFullAccess) return true;
  const need = requiredPermissionForPath(pathname);
  if (need === undefined) return true;
  return pathMatchesRequirement(keys, need);
}

/** Écriture produit (fiche / prix) : même clé que création pour la v1 */
export function productWriteAllowed(keys: Set<string>, isFullAccess: boolean): boolean {
  if (isFullAccess) return true;
  return keys.has("produits.write");
}
