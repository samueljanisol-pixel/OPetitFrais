"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { SessionPayload } from "@/lib/auth/session-types";
import { buildSessionDisplayLabel } from "@/lib/auth/display-label";
import { readSessionSnapshot, writeSessionSnapshot } from "@/lib/auth/session-display-cache";

export function useSessionPermissions() {
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);

  /** Affichage immédiat après navigation (évite un écran « … » le temps du fetch). */
  useLayoutEffect(() => {
    const snap = readSessionSnapshot();
    if (snap) setSession(snap);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        const j = (await res.json()) as { session: SessionPayload | null };
        if (cancelled) return;
        setSession(j.session);
        writeSessionSnapshot(j.session);
        if (j.session?.uiLocale) {
          document.cookie = `locale=${j.session.uiLocale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        }
      } catch {
        if (!cancelled) {
          setSession(null);
          writeSessionSnapshot(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
