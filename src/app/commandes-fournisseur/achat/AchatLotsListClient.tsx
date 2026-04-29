"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { useRouter } from "next/navigation";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";

type SupplierRefOne = { id?: string; code?: string; label?: string } | null | undefined;

type LotRow = {
  id: string;
  supplier_id: string;
  status: string;
  marque_prete_at: string | null;
  marque_terminee_at: string | null;
  created_at: string;
  ref_supplier: SupplierRefOne | SupplierRefOne[];
};

function supplierLabel(raw: LotRow["ref_supplier"]): string {
  if (raw == null) return "—";
  const o = Array.isArray(raw) ? raw[0] : raw;
  const lb = typeof o?.label === "string" ? o.label.trim() : "";
  const code = typeof o?.code === "string" ? o.code.trim() : "";
  if (lb.length > 0) return lb;
  if (code.length > 0) return code;
  return "—";
}

export default function AchatLotsListClient() {
  const router = useRouter();
  const { loading: permLoading, can } = useSessionPermissions();
  const [statusMode, setStatusMode] = useState<"prete" | "all">("prete");
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !can("commandes_fournisseur.achat")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const q = statusMode === "all" ? "?status=all" : "?status=prete";
      const res = await fetch(`/api/commandes-fournisseur/achat/lots${q}`, { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as { lots?: LotRow[]; error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : "Erreur de chargement");
        setLots([]);
        return;
      }
      setLots(Array.isArray(json.lots) ? json.lots : []);
    } catch {
      setErr("Réseau indisponible");
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, [statusMode]);

  useEffect(() => {
    if (!permLoading && can("commandes_fournisseur.achat")) {
      void load();
    }
  }, [permLoading, can, load]);

  const handleToggle = (_ev: unknown, next: "prete" | "all" | null) => {
    if (!next) return;
    setStatusMode(next);
  };

  if (permLoading) {
    return <p className="px-4 py-6">Chargement…</p>;
  }

  if (!can("commandes_fournisseur.achat")) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <Button
        component={AppLink}
        href="/commandes-fournisseur"
        color="inherit"
        size="small"
        startIcon={<ChevronLeftIcon fontSize="small" />}
        sx={{
          textTransform: "none",
          mb: 1,
          alignSelf: "flex-start",
          pl: 0,
          minHeight: 36,
          fontWeight: 500,
        }}
      >
        Retour hub
      </Button>
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }}>
        Achat — lots
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-4">
        Lots prêts à saisie et achat ; après clôture, lecture seule.
      </Typography>

      <div className="flex flex-wrap items-center gap-2 !mb-4">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={statusMode}
          onChange={handleToggle}
          aria-label="Filtre statut lots"
          sx={{
            "& .MuiToggleButton-root": {
              textTransform: "none",
            },
          }}
        >
          <ToggleButton value="prete">À traiter</ToggleButton>
          <ToggleButton value="all">Tous (prêts + terminés)</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" variant="outlined" onClick={() => void load()} sx={{ textTransform: "none" }}>
          Actualiser
        </Button>
      </div>

      {err ? (
        <Alert severity="error" className="!mb-3">
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-600">
          <CircularProgress size={20} /> Chargement des lots…
        </div>
      ) : lots.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Aucun lot pour ce filtre.
        </Typography>
      ) : (
        <div className="flex flex-col gap-3">
          {lots.map((l) => (
            <div
              key={l.id}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }} className="truncate">
                    {supplierLabel(l.ref_supplier)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Statut&nbsp;: {String(l.status)} — Prête le{" "}
                    {l.marque_prete_at ? new Date(l.marque_prete_at).toLocaleString("fr-FR") : "—"}
                    {l.status === "terminee" ? (
                      <>
                        {" "}
                        — Clôturée le{" "}
                        {l.marque_terminee_at ? new Date(l.marque_terminee_at).toLocaleString("fr-FR") : "—"}
                      </>
                    ) : null}
                  </Typography>
                </div>
                <Button
                  component={AppLink}
                  href={`/commandes-fournisseur/achat/lots/${l.id}`}
                  variant="contained"
                  size="small"
                  sx={{ textTransform: "none", flexShrink: 0 }}
                >
                  Ouvrir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
