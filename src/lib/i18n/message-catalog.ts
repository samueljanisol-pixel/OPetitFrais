import type { AppLocale } from "@/i18n/config";
import frMessages from "@/messages/fr.json";
import arMessages from "@/messages/ar-MA.json";

export type TranslationSection = {
  id: string;
  label: string;
  /** Préfixe des clés (ex. backoffice.commandes.saisie). */
  prefix: string;
};

/** Sections = « pages » / zones de l’app éditables dans Paramètres. */
export const TRANSLATION_SECTIONS: TranslationSection[] = [
  { id: "common", label: "Commun (boutons)", prefix: "common" },
  { id: "shell", label: "En-tête application", prefix: "backoffice.shell" },
  { id: "home", label: "Accueil", prefix: "backoffice.home" },
  { id: "login", label: "Connexion", prefix: "backoffice.login" },
  { id: "accessDenied", label: "Accès refusé", prefix: "backoffice.accessDenied" },
  { id: "auth", label: "Erreurs connexion", prefix: "backoffice.auth" },
  { id: "status", label: "Statuts commandes / lots", prefix: "backoffice.status" },
  { id: "cmd-landing", label: "Commandes — hub", prefix: "backoffice.commandes.landing" },
  { id: "cmd-common", label: "Commandes — libellés communs", prefix: "backoffice.commandes.common" },
  { id: "cmd-saisie-index", label: "Commandes — liste saisie", prefix: "backoffice.commandes.saisie.index" },
  { id: "cmd-saisie-magasin", label: "Commandes — magasin actif", prefix: "backoffice.commandes.saisie.magasinStrip" },
  { id: "cmd-saisie-nouvelle", label: "Commandes — nouvelle commande", prefix: "backoffice.commandes.saisie.nouvelle" },
  { id: "cmd-parcours", label: "Commandes — parcours produit", prefix: "backoffice.commandes.parcours" },
  { id: "cmd-recap", label: "Commandes — récapitulatif", prefix: "backoffice.commandes.recap" },
  { id: "cmd-validation-index", label: "Commandes — validation (liste)", prefix: "backoffice.commandes.validation.index" },
  { id: "cmd-validation-lot", label: "Commandes — détail lot validation", prefix: "backoffice.commandes.validation.lotDetail" },
  { id: "cmd-achat-list", label: "Commandes — achat (liste lots)", prefix: "backoffice.commandes.achat.list" },
  { id: "cmd-achat-detail", label: "Commandes — achat (détail lot)", prefix: "backoffice.commandes.achat.detail" },
  { id: "cmd-qty", label: "Commandes — quantités / conditionnement", prefix: "backoffice.commandes.quantityPanel" },
  { id: "cmd-errors", label: "Commandes — messages d’erreur", prefix: "backoffice.commandes.errors" },
  { id: "cmd-components", label: "Commandes — commentaires ligne", prefix: "backoffice.commandes.components" },
];

const BASE_BY_LOCALE: Record<AppLocale, Record<string, unknown>> = {
  fr: frMessages as Record<string, unknown>,
  "ar-MA": arMessages as Record<string, unknown>,
};

export function getBaseMessages(locale: AppLocale): Record<string, unknown> {
  return BASE_BY_LOCALE[locale];
}

/** Aplatit l’arbre JSON en clés pointées → chaînes feuilles. */
export function flattenMessageTree(
  node: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[path] = value;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenMessageTree(value as Record<string, unknown>, path));
    }
  }
  return out;
}

export function listKeysForSection(sectionPrefix: string): string[] {
  const frFlat = flattenMessageTree(getBaseMessages("fr"));
  const prefix = sectionPrefix.endsWith(".") ? sectionPrefix.slice(0, -1) : sectionPrefix;
  return Object.keys(frFlat)
    .filter((k) => k === prefix || k.startsWith(`${prefix}.`))
    .sort((a, b) => a.localeCompare(b, "fr"));
}

function setNestedValue(root: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/** Applique les surcharges (clé complète → texte) sur une copie des messages de base. */
export function applyMessageOverrides(
  base: Record<string, unknown>,
  overrides: Record<string, string>,
): Record<string, unknown> {
  const merged = structuredClone(base);
  for (const [path, value] of Object.entries(overrides)) {
    setNestedValue(merged, path, value);
  }
  return merged;
}

export type TranslationRowDto = {
  messageKey: string;
  defaultFr: string;
  defaultAr: string;
  valueFr: string;
  valueAr: string;
  overriddenFr: boolean;
  overriddenAr: boolean;
};

export function buildSectionRows(
  sectionPrefix: string,
  overridesFr: Record<string, string>,
  overridesAr: Record<string, string>,
): TranslationRowDto[] {
  const frFlat = flattenMessageTree(getBaseMessages("fr"));
  const arFlat = flattenMessageTree(getBaseMessages("ar-MA"));
  const keys = listKeysForSection(sectionPrefix);

  return keys.map((messageKey) => {
    const defaultFr = frFlat[messageKey] ?? "";
    const defaultAr = arFlat[messageKey] ?? "";
    const overriddenFr = Object.prototype.hasOwnProperty.call(overridesFr, messageKey);
    const overriddenAr = Object.prototype.hasOwnProperty.call(overridesAr, messageKey);
    return {
      messageKey,
      defaultFr,
      defaultAr,
      valueFr: overriddenFr ? overridesFr[messageKey] : defaultFr,
      valueAr: overriddenAr ? overridesAr[messageKey] : defaultAr,
      overriddenFr,
      overriddenAr,
    };
  });
}
