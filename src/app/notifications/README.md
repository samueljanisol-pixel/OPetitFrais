# Notifications

Système hybride **in-app** (cloche dans l'en-tête) + **Web Push** optionnel (mobile et desktop).

## Types disponibles

| Clé | Permission requise | Déclencheur |
|-----|-------------------|-------------|
| `commande_fournisseur.validee` | `commandes_fournisseur.consolidation` | Validation magasin d'une commande (`PATCH` → statut `validee`) |

## Parcours utilisateur

1. **Cloche** (`NotificationBell` dans `AppShell`) — visible pour les utilisateurs avec permission consolidation.
2. **Préférences** — `/notifications` : toggles in-app et push par type.
3. **Clic notification** — redirection vers `/commandes-fournisseur/validation` (liste des commandes en attente).

## API

| Route | Rôle |
|-------|------|
| `GET /api/notifications` | Liste + compteur non lues |
| `PATCH /api/notifications/[id]/read` | Marquer lue |
| `POST /api/notifications/read-all` | Tout marquer lu |
| `GET/PATCH /api/notifications/preferences` | Préférences par type |
| `POST /api/notifications/push/subscribe` | Abonnement Web Push |
| `DELETE /api/notifications/push/unsubscribe` | Désabonnement |

## Base de données

Migration : `supabase/migrations/20260703140000_notifications.sql`

- `user_notification_preferences` — préférences par utilisateur et type
- `user_notifications` — notifications in-app (insert service role uniquement)
- `user_push_subscriptions` — endpoints Web Push
- `profiles_with_permission(p_key)` — helper SQL pour les destinataires

## Web Push (configuration serveur)

Générer les clés VAPID :

```bash
npx tsx scripts/generate-vapid-keys.ts
```

Variables `.env` :

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@opetitfrais.fr
```

Service worker : `public/sw.js` (handlers `push` et `notificationclick`).

## Compatibilité mobile / desktop

| Plateforme | In-app | Push |
|------------|--------|------|
| Chrome desktop / Android | Oui | Oui |
| Firefox desktop | Oui | Oui |
| Safari macOS 13+ | Oui | Oui |
| iOS (PWA installée, 16.4+) | Oui | Oui |
| iOS Safari (navigateur) | Oui | Non — bandeau explicatif dans les préférences |

Sans clés VAPID, l'in-app fonctionne ; le toggle push affiche un message d'information.

## Fichiers clés

- `src/lib/notifications/` — logique métier, hooks client
- `src/components/NotificationBell.tsx` — UI cloche
- `src/app/notifications/` — page préférences
