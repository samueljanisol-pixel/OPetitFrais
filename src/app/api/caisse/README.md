# API caisse (WinDev)

## Impression commande magasin

Le **PDF pose problème** avec WinDev / l’imprimante ticket (pages coupées, seule la fin s’imprime).  
**Ne plus s’appuyer sur le PDF** pour la caisse. Deux formats fiables :

| Priorité | Format | Usage |
|----------|--------|--------|
| 1 (recommandé) | `format=txt` | Texte ESC/POS 64 col., bandeau fournisseur inversé → `copy /b` |
| 2 | `format=json` | Données structurées → **état d’impression WinDev** natif (comme vos tickets caisse qui marchent) |
| 3 (legacy) | `format=pdf` | À éviter côté caisse |

### URL

```
GET /api/caisse/commande-ticket?magasin=M02&token=…&lang=FR&format=txt
GET /api/caisse/commande-ticket?magasin=M02&token=…&lang=FR&format=json
```

| Paramètre | Requis | Description |
|-----------|--------|-------------|
| `magasin` | oui | Code magasin (`M02`…) |
| `token` | oui | `CAISSE_TICKET_TOKEN` |
| `lang` | non | `FR` (défaut) ou `AR` |
| `format` | non | **`json` (défaut)**, `txt`, `pdf`, `meta` |
| `encode` | non | avec `format=txt` : `base64` (recommandé WinDev, accents OK) |
| `date` | non | `YYYY-MM-DD` |

### Contenu métier (identique pour json / txt / pdf)

- Dernière commande **non vide** par fournisseur
- Statuts : `en_saisie`, `validee`, `integree`
- Groupé par catégorie ; lignes produit + qté + unité

---

## Solution A — Texte (`format=txt`) — la plus simple

```
GET …/commande-ticket?magasin=M02&token=…&format=txt&lang=FR
```

Réponse : binaire ESC/POS (64 col., bandeau fournisseur fond noir / texte blanc) + coupe.

| `lang` | Mode | Détail |
|--------|------|--------|
| `FR` | Texte ESC/POS | Windows-1252 / `ESC t 16` |
| `AR` | **Image** ESC/POS | Noto Sans Arabic (évite les pages de codes absentes → `#µ#`) |

**Accents FR** : encodage 1 octet (pas UTF-8).  
Si WinDev réécrit le fichier en UTF-8, utilisez `&encode=base64` + `DecodeBase64` avant `fWrite`.

### WinDev — ne pas bloquer l’UI

Évitez `iPrint` / `iPrintPDF` / `iConfigure` (dialogue ou attente spooler).  
Utilisez **fichier + `copy /b`** vers le **partage** imprimante, avec `exeNoWait` :

```wl
PROCEDURE ImprimerCommandeTicket(sCodeMagasin is string, sLangueimp is string)

sURL, sFichierTXT, sCmd are strings
cReq is httpRequest
cRep is httpResponse
nFic is int

IF sCodeMagasin ~= "" THEN
	Error("Code magasin manquant.")
	RETURN
END
IF sLangueimp ~= "" THEN sLangueimp = "FR"

sURL = gsUrlBackoffice + "/api/caisse/commande-ticket" + ...
	"?magasin=" + URLEncode(sCodeMagasin) + ...
	"&lang=" + URLEncode(sLangueimp) + ...
	"&format=txt&encode=base64" + ...
	"&token=" + URLEncode(gsCaisseTicketToken)

cReq.Method = httpGet
cReq.URL = sURL
cReq.ConnectionTimeout = 15s
cReq.Timeout = 60s
cRep = HTTPSend(cReq)
IF ErrorOccurred THEN
	Error("Erreur réseau : " + ErrorInfo())
	RETURN
END
IF cRep.StatusCode <> 200 THEN
	Error(StringBuild("API ticket HTTP %1", cRep.StatusCode))
	RETURN
END

// Décode base64 → buffer binaire (accents OK, ESC/POS OK)
bufTicket is Buffer = DecodeBase64(cRep.Content)

sFichierTXT = fTempPath() + ["\"] + "commande-" + sCodeMagasin + ".bin"
nFic = fOpen(sFichierTXT, foCreate + foWrite)
IF nFic = -1 THEN
	Error("Fichier temporaire impossible.")
	RETURN
END
fWrite(nFic, bufTicket)
fClose(nFic)

sCmd = "cmd /c copy /b """ + sFichierTXT + """ """ + gsImprimante_Ticket + """"
ExeRun(sCmd, exePID, exeNonBloquant)
```

> Adaptez `DecodeBase64` / `Buffer` à votre version WinDev (`Decode` + type binaire / `buf` selon l’aide).

---

## Solution B — JSON + état WinDev (`format=json`)

```
GET …/commande-ticket?magasin=M02&token=…&format=json&lang=FR
```

Exemple de structure :

```json
{
  "magasin": { "code": "M02", "nom": "O' Petit Frais 2" },
  "dateIso": "2026-07-25",
  "lang": "fr",
  "labels": { "title": "DERNIÈRE COMMANDE", "productCol": "Produit", "qtyCol": "Qté", "unitCol": "Unité" },
  "suppliers": [
    {
      "label": "Marché",
      "dateIso": "2026-07-25",
      "categories": [
        {
          "label": "Fruit",
          "lines": [
            { "name": "Banane", "qty": 5, "qtyLabel": "5", "unit": "Kg", "packaging": null }
          ]
        }
      ]
    }
  ]
}
```

### WinDev

1. `HTTPSend` → JSON  
2. Remplir un **état d’impression** (ou mémoire table) : rupture sur `suppliers.label` puis `categories.label`  
3. Imprimer avec **votre état ticket 80 mm** déjà au point (celui de `ticket.pdf`)

C’est le même chemin que vos tickets caisse qui s’impriment bien.

---

## Legacy PDF (`format=pdf`)

Conservé pour tests navigateur uniquement. Non recommandé en caisse.

---

## Config

```
CAISSE_TICKET_TOKEN=<secret>
```
