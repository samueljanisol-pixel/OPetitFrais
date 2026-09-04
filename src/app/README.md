# Accueil backoffice

Menu principal (`/`, [`BackofficeHome.tsx`](./BackofficeHome.tsx)).

## Affichage des boutons

Chaque entrée est filtrée par les permissions de session (`useSessionPermissions`). Le rôle système `administrateur` (ou `is_full_access`) affiche tout le menu. **Clôtures** (`/clotures`) : `ventes.read`. Badge orange = nombre de clôtures **à vérifier** (`GET /api/clotures/count`).

Si le cadre du menu est vide :

1. Vérifier le nom affiché dans l’en-tête (compte réellement connecté).
2. Déconnexion puis reconnexion (cookies / refresh token Supabase parfois invalides).
3. Vérifier le rôle du profil dans Admin → Utilisateurs.

Message i18n : `backoffice.home.noMenuAccess` / `sessionMissing`.
