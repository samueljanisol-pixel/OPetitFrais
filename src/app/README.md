# Accueil backoffice

Menu principal (`/`, [`BackofficeHome.tsx`](./BackofficeHome.tsx)).

## Affichage des boutons

Chaque entrée est filtrée par les permissions de session (`useSessionPermissions`). Le rôle système `administrateur` (ou `is_full_access`) affiche tout le menu.

Si le cadre du menu est vide :

1. Vérifier le nom affiché dans l’en-tête (compte réellement connecté).
2. Déconnexion puis reconnexion (cookies / refresh token Supabase parfois invalides).
3. Vérifier le rôle du profil dans Admin → Utilisateurs.
4. Vérifier l’heure Windows (décalage → erreur PostgREST `JWT issued at future` / PGRST303).

La session UI charge profil et permissions via service role après `auth.getUser()` (`loadUserAccessByUserId`), pour rester utilisable même si le JWT utilisateur est refusé par PostgREST.

**Incident PGRST303 (août 2026)** : PostgREST peut rejeter les JWT Auth (`JWT issued at future`) alors que `/auth/v1` fonctionne. Contournement applicatif :
- navigateur → `/api/supabase-proxy/...` (service role, session cookie requise)
- serveur → swap Authorization service role dans `createSupabaseServerClient` après `getUser()`

À retirer quand Supabase aura corrigé le skew Auth/PostgREST.

Message i18n : `backoffice.home.noMenuAccess` / `sessionMissing`.
