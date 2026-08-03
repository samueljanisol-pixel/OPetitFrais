"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import FormDialog from "@/lib/mui/FormDialog";
import {
  MAGASIN_SITE_TYPE_LABELS,
  MAGASIN_SITE_TYPES,
  magasinSiteHasCaisses,
  magasinSiteHasVitrineFields,
  type MagasinSiteType,
} from "@/lib/magasins/types";

type CaisseRow = {
  id: string;
  magasin_id: string;
  code: string | null;
  nom: string;
  sort_order: number;
};

type MagasinRow = {
  id: string;
  code: string;
  nom: string;
  type: MagasinSiteType;
  sort_order: number;
  adresse: string | null;
  ville: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
  visible_vitrine: boolean;
  caisses: CaisseRow[];
};

export default function MagasinsAdminPanel() {
  const [magasins, setMagasins] = useState<MagasinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [magOpen, setMagOpen] = useState(false);
  const [magEditing, setMagEditing] = useState<MagasinRow | null>(null);
  const [magCode, setMagCode] = useState("");
  const [magNom, setMagNom] = useState("");
  const [magAdresse, setMagAdresse] = useState("");
  const [magVille, setMagVille] = useState("");
  const [magLat, setMagLat] = useState("");
  const [magLng, setMagLng] = useState("");
  const [magMapsUrl, setMagMapsUrl] = useState("");
  const [magVisibleVitrine, setMagVisibleVitrine] = useState(false);
  const [magType, setMagType] = useState<MagasinSiteType>("magasin");
  const [magSaving, setMagSaving] = useState(false);

  const [caisseOpen, setCaisseOpen] = useState(false);
  const [caisseMagId, setCaisseMagId] = useState<string | null>(null);
  const [caisseEditing, setCaisseEditing] = useState<CaisseRow | null>(null);
  const [caisseNom, setCaisseNom] = useState("");
  const [caisseCode, setCaisseCode] = useState("");
  const [caisseSaving, setCaisseSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/magasins", { credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { error?: string }).error ?? "Chargement impossible");
      }
      setMagasins((j as { magasins?: MagasinRow[] }).magasins ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNewMag = () => {
    setMagEditing(null);
    setMagCode("");
    setMagNom("");
    setMagType("magasin");
    setMagAdresse("");
    setMagVille("");
    setMagLat("");
    setMagLng("");
    setMagMapsUrl("");
    setMagVisibleVitrine(false);
    setMagOpen(true);
    setErr(null);
  };

  const openEditMag = (m: MagasinRow) => {
    setMagEditing(m);
    setMagCode(m.code);
    setMagNom(m.nom);
    setMagType(m.type ?? "magasin");
    setMagAdresse(m.adresse ?? "");
    setMagVille(m.ville ?? "");
    setMagLat(m.lat != null ? String(m.lat) : "");
    setMagLng(m.lng != null ? String(m.lng) : "");
    setMagMapsUrl(m.google_maps_url ?? "");
    setMagVisibleVitrine(!!m.visible_vitrine);
    setMagOpen(true);
    setErr(null);
  };

  const saveMag = async () => {
    const code = magCode.trim();
    const nom = magNom.trim();
    if (!code || !nom) {
      setErr("Code et nom magasin requis");
      return;
    }
    setMagSaving(true);
    setErr(null);
    try {
      const sort_order =
        magEditing != null
          ? magEditing.sort_order
          : magasins.length === 0
            ? 0
            : Math.max(...magasins.map((m) => m.sort_order ?? 0)) + 1;
      const latTrim = magLat.trim();
      const lngTrim = magLng.trim();
      let lat: number | null = null;
      let lng: number | null = null;
      if (latTrim || lngTrim) {
        lat = Number(latTrim);
        lng = Number(lngTrim);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("Latitude / longitude invalides");
        }
      }
      const publicFields = magasinSiteHasVitrineFields(magType)
        ? {
            adresse: magAdresse.trim() || null,
            ville: magVille.trim() || null,
            lat,
            lng,
            google_maps_url: magMapsUrl.trim() || null,
            visible_vitrine: magVisibleVitrine,
          }
        : {
            adresse: null,
            ville: null,
            lat: null,
            lng: null,
            google_maps_url: null,
            visible_vitrine: false,
          };
      if (magEditing) {
        const res = await fetch(`/api/admin/magasins/${magEditing.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, nom, sort_order, type: magType, ...publicFields }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j as { error?: string }).error ?? "Erreur");
      } else {
        const res = await fetch("/api/admin/magasins", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, nom, sort_order, type: magType }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          magasin?: { id?: string };
        };
        if (!res.ok) throw new Error(j.error ?? "Erreur");
        const newId = j.magasin?.id;
        if (newId && magasinSiteHasVitrineFields(magType) && (publicFields.adresse || publicFields.lat != null || publicFields.visible_vitrine)) {
          const res2 = await fetch(`/api/admin/magasins/${newId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(publicFields),
          });
          const j2 = await res2.json().catch(() => ({}));
          if (!res2.ok) throw new Error((j2 as { error?: string }).error ?? "Erreur adresse");
        }
      }
      setMagOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setMagSaving(false);
    }
  };

  const deleteMag = async (id: string) => {
    if (!confirm("Supprimer ce site ? Les caisses associées seront aussi supprimées.")) return;
    setErr(null);
    const res = await fetch(`/api/admin/magasins/${id}`, { method: "DELETE", credentials: "include" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((j as { error?: string }).error ?? "Suppression impossible");
      return;
    }
    await load();
  };

  const openNewCaisse = (magasinId: string) => {
    setCaisseMagId(magasinId);
    setCaisseEditing(null);
    setCaisseNom("");
    setCaisseCode("");
    setCaisseOpen(true);
    setErr(null);
  };

  const openEditCaisse = (magasinId: string, c: CaisseRow) => {
    setCaisseMagId(magasinId);
    setCaisseEditing(c);
    setCaisseNom(c.nom);
    setCaisseCode(c.code ?? "");
    setCaisseOpen(true);
    setErr(null);
  };

  const saveCaisse = async () => {
    const nom = caisseNom.trim();
    if (!nom || !caisseMagId) {
      setErr("Nom caisse requis");
      return;
    }
    setCaisseSaving(true);
    setErr(null);
    try {
      const mag = magasins.find((m) => m.id === caisseMagId);
      const caisses = mag?.caisses ?? [];
      const sort_order =
        caisseEditing != null
          ? caisseEditing.sort_order
          : caisses.length === 0
            ? 0
            : Math.max(...caisses.map((c) => c.sort_order ?? 0)) + 1;
      const code = caisseCode.trim() || null;
      if (caisseEditing) {
        const res = await fetch(`/api/admin/caisses/${caisseEditing.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nom, code, sort_order }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j as { error?: string }).error ?? "Erreur");
      } else {
        const res = await fetch(`/api/admin/magasins/${caisseMagId}/caisses`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nom, code, sort_order }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j as { error?: string }).error ?? "Erreur");
      }
      setCaisseOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCaisseSaving(false);
    }
  };

  const deleteCaisse = async (id: string) => {
    if (!confirm("Supprimer cette caisse ?")) return;
    setErr(null);
    const res = await fetch(`/api/admin/caisses/${id}`, { method: "DELETE", credentials: "include" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((j as { error?: string }).error ?? "Suppression impossible");
      return;
    }
    await load();
  };

  const moveMag = async (id: string, direction: -1 | 1) => {
    const sorted = [...magasins];
    const idx = sorted.findIndex((m) => m.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;

    const next = [...sorted];
    const tmp = next[idx]!;
    next[idx] = next[swapIdx]!;
    next[swapIdx] = tmp;

    const updates = next.map((m, i) => ({ id: m.id, sort_order: i }));
    setReordering(true);
    setErr(null);
    try {
      const results = await Promise.all(
        updates.map((u) =>
          fetch(`/api/admin/magasins/${u.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: u.sort_order }),
          }),
        ),
      );
      for (const res of results) {
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "Réordonnancement impossible");
        }
      }
      setMagasins(next.map((m, i) => ({ ...m, sort_order: i })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setReordering(false);
    }
  };

  const moveCaisse = async (magasinId: string, caisseId: string, direction: -1 | 1) => {
    const mag = magasins.find((m) => m.id === magasinId);
    if (!mag?.caisses?.length) return;

    const sorted = [...mag.caisses];
    const idx = sorted.findIndex((c) => c.id === caisseId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;

    const nextCaisses = [...sorted];
    const tmp = nextCaisses[idx]!;
    nextCaisses[idx] = nextCaisses[swapIdx]!;
    nextCaisses[swapIdx] = tmp;

    const updates = nextCaisses.map((c, i) => ({ id: c.id, sort_order: i }));
    setReordering(true);
    setErr(null);
    try {
      const results = await Promise.all(
        updates.map((u) =>
          fetch(`/api/admin/caisses/${u.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: u.sort_order }),
          }),
        ),
      );
      for (const res of results) {
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "Réordonnancement impossible");
        }
      }
      setMagasins((prev) =>
        prev.map((m) =>
          m.id === magasinId
            ? { ...m, caisses: nextCaisses.map((c, i) => ({ ...c, sort_order: i })) }
            : m,
        ),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setReordering(false);
    }
  };

  if (loading) {
    return <Typography className="!text-slate-600">Chargement des sites…</Typography>;
  }

  const showVitrineFields = magasinSiteHasVitrineFields(magType);

  return (
    <Box className="flex flex-col gap-4">
      {err ? (
        <Paper className="!border-rose-200 !bg-rose-50 !p-3">
          <Typography color="error">{err}</Typography>
        </Paper>
      ) : null}
      <Typography variant="body2" className="!text-slate-600">
        Créez des <strong>magasins</strong> (vente, CA, caisses, vitrine) ou d&apos;autres <strong>sites</strong>{" "}
        (ex. <strong>cuisine</strong>) pour le planning salariés et le périmètre utilisateurs. Pour un magasin, le{" "}
        <strong>code</strong> doit correspondre à la clé CA (ex. dossier FTP <span className="font-mono">M01</span>).
      </Typography>
      <Button variant="contained" color="success" onClick={openNewMag} sx={{ textTransform: "none", alignSelf: "flex-start" }}>
        Nouveau site
      </Button>
      <div className="flex flex-col gap-4">
        {magasins.map((m, magIdx) => {
          const siteType = m.type ?? "magasin";
          const hasCaisses = magasinSiteHasCaisses(siteType);
          return (
          <Paper key={m.id} className="!p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-1">
                <Box sx={{ display: "inline-flex", flexDirection: "column", mr: 0.5, mt: 0.25 }}>
                  <IconButton
                    size="small"
                    aria-label="Monter"
                    disabled={reordering || magIdx <= 0}
                    onClick={() => void moveMag(m.id, -1)}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Descendre"
                    disabled={reordering || magIdx >= magasins.length - 1}
                    onClick={() => void moveMag(m.id, 1)}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </Box>
                <div className="min-w-0">
                <Typography variant="subtitle1" className="!flex !flex-wrap !items-center !gap-2 !font-semibold">
                  <span>
                    {m.nom}{" "}
                    <span className="font-mono text-sm font-normal text-slate-600">({m.code})</span>
                  </span>
                  <Chip
                    size="small"
                    label={MAGASIN_SITE_TYPE_LABELS[siteType]}
                    variant="outlined"
                    sx={{ height: 22, fontSize: "0.75rem" }}
                  />
                </Typography>
                <Typography variant="caption" className="!text-slate-500">
                  {siteType === "magasin" && m.visible_vitrine ? "Visible vitrine" : ""}
                  {siteType === "magasin" && m.visible_vitrine && m.ville ? " · " : ""}
                  {m.ville ?? ""}
                </Typography>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="small" onClick={() => openEditMag(m)} sx={{ textTransform: "none" }}>
                  Modifier
                </Button>
                <Button size="small" color="error" onClick={() => void deleteMag(m.id)} sx={{ textTransform: "none" }}>
                  Supprimer
                </Button>
                {hasCaisses ? (
                  <Button size="small" onClick={() => openNewCaisse(m.id)} sx={{ textTransform: "none" }}>
                    + Caisse
                  </Button>
                ) : null}
              </div>
            </div>
            {hasCaisses ? (
              m.caisses?.length ? (
              <ul className="mt-3 list-inside list-disc text-sm text-slate-800">
                {m.caisses.map((c, caisseIdx) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-1">
                    <span className="flex min-w-0 items-center gap-1">
                      <Box sx={{ display: "inline-flex", alignItems: "center" }}>
                        <IconButton
                          size="small"
                          aria-label="Monter"
                          disabled={reordering || caisseIdx <= 0}
                          onClick={() => void moveCaisse(m.id, c.id, -1)}
                        >
                          <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Descendre"
                          disabled={reordering || caisseIdx >= m.caisses.length - 1}
                          onClick={() => void moveCaisse(m.id, c.id, 1)}
                        >
                          <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                      {c.nom}
                      {c.code ? <span className="ml-1 font-mono text-slate-600">({c.code})</span> : null}
                    </span>
                    <span>
                      <Button size="small" onClick={() => openEditCaisse(m.id, c)} sx={{ textTransform: "none" }}>
                        Modifier
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => void deleteCaisse(c.id)}
                        sx={{ textTransform: "none" }}
                      >
                        Suppr.
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Typography variant="body2" className="!mt-2 !text-slate-500">
                Aucune caisse enregistrée.
              </Typography>
            )
            ) : null}
          </Paper>
        );
        })}
        {!magasins.length ? (
          <Typography variant="body2" className="!text-slate-600">
            Aucun site. Créez un magasin ou une cuisine pour rattacher des utilisateurs ou des salariés.
          </Typography>
        ) : null}
      </div>

      <FormDialog
        open={magOpen}
        onClose={() => {
          if (!magSaving) setMagOpen(false)
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{magEditing ? "Modifier le site" : "Nouveau site"}</DialogTitle>
        <DialogContent>
          <div className="mt-2 flex flex-col gap-2">
            <FormControl size="small" fullWidth>
              <InputLabel id="mag-type-label">Type de site</InputLabel>
              <Select
                labelId="mag-type-label"
                label="Type de site"
                value={magType}
                onChange={(e) => {
                  const next = e.target.value as MagasinSiteType;
                  setMagType(next);
                  if (!magasinSiteHasVitrineFields(next)) {
                    setMagVisibleVitrine(false);
                  }
                }}
              >
                {MAGASIN_SITE_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {MAGASIN_SITE_TYPE_LABELS[t]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={magType === "magasin" ? "Code (ex. M01)" : "Code (ex. CUI01)"}
              value={magCode}
              onChange={(e) => setMagCode(e.target.value)}
              size="small"
              fullWidth
              disabled={!!magEditing}
              helperText={
                magEditing
                  ? "Le code ne peut pas être modifié (données liées)."
                  : magType === "magasin"
                    ? "Doit correspondre à la clé CA / dossier FTP."
                    : "Identifiant interne unique pour ce site."
              }
            />
            <TextField label="Nom affiché" value={magNom} onChange={(e) => setMagNom(e.target.value)} size="small" fullWidth />
            {showVitrineFields ? (
              <>
            <TextField
              label="Adresse (vitrine)"
              value={magAdresse}
              onChange={(e) => setMagAdresse(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label="Ville"
              value={magVille}
              onChange={(e) => setMagVille(e.target.value)}
              size="small"
              fullWidth
            />
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Latitude"
                value={magLat}
                onChange={(e) => setMagLat(e.target.value)}
                size="small"
                fullWidth
              />
              <TextField
                label="Longitude"
                value={magLng}
                onChange={(e) => setMagLng(e.target.value)}
                size="small"
                fullWidth
              />
            </div>
            <TextField
              label="Lien Google Maps"
              value={magMapsUrl}
              onChange={(e) => setMagMapsUrl(e.target.value)}
              size="small"
              fullWidth
              helperText="Coller le lien de la fiche Google Maps du magasin"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={magVisibleVitrine}
                  onChange={(e) => setMagVisibleVitrine(e.target.checked)}
                />
              }
              label="Visible sur la carte boutique (/livraison)"
            />
              </>
            ) : null}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMagOpen(false)} disabled={magSaving}>
            Annuler
          </Button>
          <Button variant="contained" color="success" onClick={() => void saveMag()} disabled={magSaving}>
            {magSaving ? "…" : "Enregistrer"}
          </Button>
        </DialogActions>
      </FormDialog>

      <FormDialog
        open={caisseOpen}
        onClose={() => {
          if (!caisseSaving) setCaisseOpen(false)
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{caisseEditing ? "Modifier la caisse" : "Nouvelle caisse"}</DialogTitle>
        <DialogContent>
          <div className="mt-2 flex flex-col gap-2">
            <TextField label="Nom" value={caisseNom} onChange={(e) => setCaisseNom(e.target.value)} size="small" fullWidth />
            <TextField
              label="Code (optionnel)"
              value={caisseCode}
              onChange={(e) => setCaisseCode(e.target.value)}
              size="small"
              fullWidth
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCaisseOpen(false)} disabled={caisseSaving}>
            Annuler
          </Button>
          <Button variant="contained" color="success" onClick={() => void saveCaisse()} disabled={caisseSaving}>
            {caisseSaving ? "…" : "Enregistrer"}
          </Button>
        </DialogActions>
      </FormDialog>
    </Box>
  );
}
