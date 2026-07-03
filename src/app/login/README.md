# Login

Page de connexion staff (`/login`).

## Internationalisation

- Sélecteur **FR / عربي** en haut du formulaire ([`LocaleSwitcher`](../../components/LocaleSwitcher.tsx), variante `login`)
- Avant authentification : la locale est stockée dans le cookie `locale` uniquement
- Après connexion : `profiles.ui_locale` est appliqué et le cookie resynchronisé ([`/api/auth/login`](../api/auth/login/route.ts))

Clés de traduction : `backoffice.login.*`, erreurs auth `backoffice.auth.errors.*`.

## Mobile / autofill

Le bouton « Se connecter » n’est grisé que pendant la requête (`loading`). Les identifiants sont lus via `FormData` à la soumission (et non uniquement via l’état React), car sur mobile Safari/Chrome l’autofill remplit les champs sans toujours déclencher `onChange`.

Voir [`src/i18n/README.md`](../../i18n/README.md) pour le socle i18n global.
