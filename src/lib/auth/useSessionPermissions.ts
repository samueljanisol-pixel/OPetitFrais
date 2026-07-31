"use client";

import { useCallback } from "react";
import { buildSessionDisplayLabel } from "@/lib/auth/display-label";
import { useSessionContext } from "@/lib/auth/SessionProvider";

export function useSessionPermissions() {
  const { session } = useSessionContext();

  const loading = session === undefined;
  const isFullAccess = session?.isFullAccess ?? false;
  const roleSlug = session?.roleSlug ?? null;
  /** Onglet Administration (Paramètres) : réservé au rôle système « administrateur ». */
  const isAdministrator = roleSlug === "administrateur";
  const permissionList = session?.permissions;
  const can = useCallback(
    (key: string) => {
      if (isFullAccess) return true;
      if (!permissionList || permissionList.length === 0) return false;
      return permissionList.includes(key);
    },
    [isFullAccess, permissionList],
  );

  const displayName = (() => {
    if (!session) return "";
    return buildSessionDisplayLabel(session, null);
  })();

  return {
    loading,
    session: session ?? null,
    isAdministrator,
    displayName,
    userId: session?.userId ?? null,
    roleId: session?.roleId ?? null,
    roleName: session?.roleName ?? null,
    roleSlug: session?.roleSlug ?? null,
    isFullAccess: session?.isFullAccess ?? false,
    can,
    linkedMagasins: session?.magasins ?? [],
    magasinsRestricted: session?.magasinsRestricted ?? false,
    canWriteProducts: can("produits.write"),
    canReadVentes: can("ventes.read"),
    canReadParametres: can("parametres.read"),
    canWriteParametres: can("parametres.write"),
    canReadCharges: can("charges.read"),
    canWriteCharges: can("charges.write"),
    canReadEmballages: can("emballages.read"),
    canWriteEmballages: can("emballages.write"),
    canAdminUsers: can("admin.utilisateurs"),
    canAdminRoles: can("admin.roles"),
    canAdminMagasins: can("admin.magasins"),
    canCommandesFournisseurSaisie: can("commandes_fournisseur.saisie"),
    canCommandesFournisseurConsolidation: can("commandes_fournisseur.consolidation"),
    canCommandesFournisseurAchat: can("commandes_fournisseur.achat"),
    canCommandesFournisseurComptes: can("commandes_fournisseur.comptes"),
    canCommandesFournisseurVendeursRenommer: can("commandes_fournisseur.vendeurs_renommer"),
    canCuisineSaisie: can("cuisine.saisie"),
    canCuisineHistorique: can("cuisine.historique"),
    canReadShop: can("shop.read"),
  };
}
