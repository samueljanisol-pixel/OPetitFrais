# Raspberry Pi — synchro FTP (Pi Zero W)

Sur un **Pi Zero W v1.1** (512 Mo, 1 cœur), **ne pas** installer de stack Python lourde (`uvloop`, compilation longue).  
Utilisez le script **`install.py`** : un simple **cron + curl** appelle l’API déjà hébergée (Vercel).

## Prérequis côté Vercel / app

Dans les variables d’environnement de l’app déployée :

| Variable | Exemple |
|----------|---------|
| `CRON_SECRET` ou `SYNC_TOKEN` | une longue chaîne secrète |
| `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` | accès FTP caisse |
| `SUPABASE_SERVICE_ROLE_KEY` | sync vers Supabase |

L’URL appelée est : `POST /api/supabase/sync/run` avec le token en en-tête.

## 1. Copier les fichiers sur le Pi

Depuis votre PC (adapter l’IP du Pi) :

```bash
scp -r raspberry/ pi@192.168.x.x:~/o-petit-frais-raspberry/
```

Ou clone git du dépôt sur le Pi, dossier `raspberry/`.

## 2. Lancer l’installation

Sur le Pi (SSH) :

```bash
cd ~/o-petit-frais-raspberry
sudo python3 install.py \
  --url "https://VOTRE-DOMAINE.vercel.app/api/supabase/sync/run" \
  --token "VOTRE_CRON_SECRET"
```

Options utiles :

- `--schedule "*/10 * * * *"` — toutes les 10 minutes (défaut : 15)
- `--skip-swap` — ne pas modifier le swap
- `--user root` — utilisateur cron (défaut)

**Durée** : quelques minutes (apt + cron). **Pas de `pip install uvloop`.**

## 3. Vérifier

```bash
sudo /usr/local/bin/opf-sync-remote.sh
sudo tail -30 /var/log/o-petit-frais/sync-$(date +%Y%m%d).log
```

Réponse JSON attendue : `"ok": true`, `processedDays`, etc.

Cron installé : `/etc/cron.d/o-petit-frais-sync`  
Secrets : `/etc/o-petit-frais-sync.env` (chmod 600)

## 4. Dépannage Pi Zero W

| Symptôme | Piste |
|----------|--------|
| Compilation `uvloop` interminable | **Arrêter** : ce n’est **pas** requis pour cette procédure |
| `curl: (28) Timeout` | Sync longue : normal sur Zero W si l’app Vercel traite le FTP ; augmenter `-m` dans `sync-remote.sh` |
| `401 Unauthorized` | `--token` ≠ `CRON_SECRET` sur Vercel |
| Manque de RAM | Relancer install sans `--skip-swap` (swap 1024 Mo) |

## Sync locale Node (déconseillé sur Zero W)

`npm run sync:day` sur le Pi implique Node 20+, `npm ci`, très lent et gourmand.  
Préférez **curl → Vercel** ou un **Pi 4** / exécution depuis le PC avec `.env.local`.

## Désinstaller

```bash
sudo rm -f /etc/cron.d/o-petit-frais-sync /usr/local/bin/opf-sync-remote.sh /etc/o-petit-frais-sync.env
sudo systemctl restart cron
```
