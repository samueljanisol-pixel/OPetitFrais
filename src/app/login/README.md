# Login

Page de connexion staff (`/login`).

## Internationalisation

- Sélecteur **FR / عربي** en haut du formulaire ([`LocaleSwitcher`](../../components/LocaleSwitcher.tsx), variante `login`)
- Avant authentification : la locale est stockée dans le cookie `locale` uniquement
- Après connexion : `profiles.ui_locale` est appliqué et le cookie resynchronisé ([`/api/auth/login`](../api/auth/login/route.ts))

Clés de traduction : `backoffice.login.*`, erreurs auth `backoffice.auth.errors.*`.

Voir [`src/i18n/README.md`](../../i18n/README.md) pour le socle i18n global.
