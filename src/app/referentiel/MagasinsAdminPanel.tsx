"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

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
  sort_order: number;
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
  const [magSort, setMagSort] = useState("0");
  const [magSaving, setMagSaving] = useState(false);

  const [caisseOpen, setCaisseOpen] = useState(false);
  const [caisseMagId, setCaisseMagId] = useState<string | null>(null);
  const [caisseEditing, setCaisseEditing] = useState<CaisseRow | null>(null);
  const [caisseNom, setCaisseNom] = useState("");
  const [caisseCode, setCaisseCode] = useState("");
  const [caisseSort, setCaisseSort] = useState("0");
  const [caisseSaving, setCaisseSaving] = useState(false);

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
    setMagSort("0");
    setMagOpen(true);
    setErr(null);
  };

  const openEditMag = (m: MagasinRow) => {
    setMagEditing(m);
    setMagCode(m.code);
    setMagNom(m.nom);
    setMagSort(String(m.sort_order ?? 0));
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
      const sort_order = parseInt(magSort, 10) || 0;
      if (magEditing) {
        const res = await fetch(`/api/admin/magasins/${magEditing.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, nom, sort_order }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j as { error?: string }).error ?? "Erreur");
      } else {
        const res = await fetch("/api/admin/magasins", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, nom, sort_order }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j as { error?: string }).error ?? "Erreur");
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
    if (!confirm("Supprimer ce magasin et toutes ses caisses ?")) return;
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
    setCaisseSort("0");
    setCaisseOpen(true);
    setErr(null);
  };

  const openEditCaisse = (magasinId: string, c: CaisseRow) => {
    setCaisseMagId(magasinId);
    setCaisseEditing(c);
    setCaisseNom(c.nom);
    setCaisseCode(c.code ?? "");
    setCaisseSort(String(c.sort_order ?? 0));
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
      const sort_order = parseInt(caisseSort, 10) || 0;
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

  if (loading) {
    return <Typography className="!text-slate-600">Chargement des magasins…</Typography>;
  }

  return (
    <Box className="flex flex-col gap-4">
      {err ? (
        <Paper className="!border-rose-200 !bg-rose-50 !p-3">
          <Typography color="error">{err}</Typography>
        </Paper>
      ) : null}
      <Typography variant="body2" className="!text-slate-600">
        Le <strong>code</strong> magasin doit correspondre à la clé utilisée dans les données CA (ex. dossier FTP{" "}
        <span className="font-mono">M01</span>).
      </Typography>
      <Button variant="contained" color="success" onClick={openNewMag} sx={{ textTransform: "none", alignSelf: "flex-start" }}>
        Nouveau magasin
      </Button>
      <div className="flex flex-col gap-4">
        {magasins.map((m) => (
          <Paper key={m.id} className="!p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Typography variant="subtitle1" className="!font-semibold">
                  {m.nom}{" "}
                  <span className="font-mono text-sm font-normal text-slate-600">({m.code})</span>
                </Typography>
                <Typography variant="caption" className="!text-slate-500">
                  Tri {m.sort_order}
                </Typography>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="small" onClick={() => openEditMag(m)} sx={{ textTransform: "none" }}>
                  Modifier
                </Button>
                <Button size="small" color="error" onClick={() => void deleteMag(m.id)} sx={{ textTransform: "none" }}>
                  Supprimer
                </Button>
                <Button size="small" onClick={() => openNewCaisse(m.id)} sx={{ textTransform: "none" }}>
                  + Caisse
                </Button>
              </div>
            </div>
            {m.caisses?.length ? (
              <ul className="mt-3 list-inside list-disc text-sm text-slate-800">
                {m.caisses.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-1">
                    <span>
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
            )}
          </Paper>
        ))}
        {!magasins.length ? (
          <Typography variant="body2" className="!text-slate-600">
            Aucun magasin. Créez-en un pour pouvoir rattacher des utilisateurs.
          </Typography>
        ) : null}
      </div>

      <Dialog open={magOpen} onClose={() => !magSaving && setMagOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{magEditing ? "Modifier le magasin" : "Nouveau magasin"}</DialogTitle>
        <DialogContent>
          <div className="mt-2 flex flex-col gap-2">
            <TextField
              label="Code (ex. M01)"
              value={magCode}
              onChange={(e) => setMagCode(e.target.value)}
              size="small"
              fullWidth
              disabled={!!magEditing}
              helperText={magEditing ? "Le code ne peut pas être modifié (données CA liées)." : undefined}
            />
            <TextField label="Nom affiché" value={magNom} onChange={(e) => setMagNom(e.target.value)} size="small" fullWidth />
            <TextField label="Ordre d’affichage" value={magSort} onChange={(e) => setMagSort(e.target.value)} size="small" type="number" fullWidth />
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
      </Dialog>

      <Dialog open={caisseOpen} onClose={() => !caisseSaving && setCaisseOpen(false)} fullWidth maxWidth="sm">
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
            <TextField
              label="Ordre d’affichage"
              value={caisseSort}
              onChange={(e) => setCaisseSort(e.target.value)}
              size="small"
              type="number"
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
      </Dialog>
    </Box>
  );
}
