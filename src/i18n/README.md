# Internationalisation (i18n)

Socle partagé **next-intl** pour le backoffice (v1) et la future boutique particuliers.

## Langues

| Code | Langue | Direction |
|------|--------|-----------|
| `fr` | Français (défaut) | LTR |
| `ar-MA` | Darija marocain (arabe) | RTL |

Fichiers de messages : [`src/messages/fr.json`](../messages/fr.json), [`src/messages/ar-MA.json`](../messages/ar-MA.json).

## Structure des namespaces

```text
common.*           → boutons et libellés transverses (backoffice + boutique)
backoffice.*       → UI staff (login, accueil, commandes…)
shop.*             → réservé à la boutique (phase 2, stub vide)
```

Les placeholders utilisent la syntaxe **ICU** de next-intl : `{name}`, `{count, plural, ...}` — pas `{{name}}`.

```tsx
const t = useTranslations("backoffice.commandes.saisie.index");
return <Typography>{t("title")}</Typography>;
```

## Résolution de la locale (backoffice)

1. Cookie `locale` (prioritaire pour le rendu serveur via [`src/i18n/request.ts`](request.ts))
2. Colonne `profiles.ui_locale` (source de vérité utilisateur connecté)
3. Synchronisation : login + `PATCH /api/auth/locale` + session API
4. Fuseau horaire fixe : `Africa/Casablanca` ([`src/i18n/config.ts`](config.ts))

Le sélecteur **FR / عربي** est dans [`LocaleSwitcher`](../components/LocaleSwitcher.tsx) (en-tête et page login).

## Helpers

| Fichier | Rôle |
|---------|------|
| [`src/i18n/config.ts`](config.ts) | Locales, `isRtl`, `normalizeLocale` |
| [`src/lib/i18n/format.ts`](../lib/i18n/format.ts) | Dates, nombres, devise |
| [`src/lib/i18n/useAppFormat.ts`](../lib/i18n/useAppFormat.ts) | Hook client |
| [`src/lib/i18n/useBackChevronIcon.ts`](../lib/i18n/useBackChevronIcon.ts) | Icône retour LTR/RTL |

## RTL (MUI + HTML)

- `<html lang dir>` défini dans [`src/app/layout.tsx`](../app/layout.tsx)
- Thème MUI + cache Emotion RTL dans [`AppProviders`](../components/AppProviders.tsx) quand `ar-MA`

## Boutique (phase 2)

La boutique réutilisera ce socle avec un route group `(shop)/[locale]/` et le namespace `shop.*`. Pas de préfixe URL sur le backoffice v1.

## Ajouter une clé

1. Ajouter la clé dans `fr.json` et `ar-MA.json` (même arborescence)
2. Utiliser `useTranslations` dans le composant
3. Lancer `npm run build` pour vérifier TypeScript
