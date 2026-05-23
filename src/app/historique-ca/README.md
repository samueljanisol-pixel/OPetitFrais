# Historique CA

Page de consultation de l’historique du chiffre d’affaires par jour et par mois.

## Filtres de période

Les boutons **2026**, **2025** et **Tous** restreignent les agrégats et le détail mensuel aux jours correspondants.

## Indicateurs en en-tête

| Carte | Description |
|-------|-------------|
| Total global | Somme du CA sur la période filtrée |
| Moyenne / jour | Total global ÷ nombre de jours |
| Moyenne / mois | Total global ÷ nombre de mois avec données |
| Jour record | Meilleur CA journalier sur la période filtrée, avec la date affichée |

Le jour record est recalculé à chaque changement de filtre (2026, 2025, Tous).

## Données

- Source : Supabase (`fetchHistoriqueFromSupabase`), avec sync FTP automatique au premier chargement si stale.
- Borne basse : `2025-05-13` (`HISTORIQUE_FROM_ISO`).
- Rôle caissier : CA limité aux magasins assignés à la session.
