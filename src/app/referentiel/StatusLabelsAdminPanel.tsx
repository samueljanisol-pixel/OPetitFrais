"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import type { RefStatusLabelRow } from "@/lib/statusLabels/types";

const DOMAIN_LABELS: Record<string, string> = {
  commande_fournisseur: "Commandes fournisseur",
  commande_fournisseur_lot: "Lots de validation",
};

export default function StatusLabelsAdminPanel() {
  const [rows, setRows] = useState<RefStatusLabelRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ref/status-labels", { credentials: "include" });
      const j = (await res.json()) as { labels?: RefStatusLabelRow[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erreur");
        setRows([]);
        return;
      }
      const list = j.labels ?? [];
      setRows(list);
      const d: Record<string, string> = {};
      for (const r of list) {
        d[r.id] = r.label;
      }
      setDraft(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byDomain = useCallback(() => {
    const m = new Map<string, RefStatusLabelRow[]>();
    for (const r of rows) {
      const list = m.get(r.domain) ?? [];
      list.push(r);
      m.set(r.domain, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.status_code.localeCompare(b.status_code));
    }
    return m;
  }, [rows]);

  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      const updates = rows.map((r) => ({
        id: r.id,
        label: (draft[r.id] ?? r.label).trim() || r.label,
      }));
      const res = await fetch("/api/ref/status-labels", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erreur");
        return;
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Typography variant="body2" className="!text-slate-600">
        Chargement des libellés…
      </Typography>
    );
  }

  const groups = byDomain();

  return (
    <Box className="mb-4 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
      <Typography variant="subtitle1" className="!mb-2 !font-semibold !text-slate-900">
        Libellés des statuts
      </Typography>
      <Typography variant="body2" className="!mb-3 !text-slate-600">
        Textes affichés pour les états des commandes fournisseur et des lots (réutilisables pour d’autres documents
        ultérieurement). Réservé à l’administrateur.
      </Typography>
      {err ? (
        <div className="mb-2 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{err}</div>
      ) : null}
      <div className="flex flex-col gap-4">
        {[...groups.entries()].map(([domain, list]) => (
          <div key={domain}>
            <Typography variant="subtitle2" className="!mb-2 !font-semibold !text-slate-800">
              {DOMAIN_LABELS[domain] ?? domain}
            </Typography>
            <div className="flex flex-col gap-2">
              {list.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{r.status_code}</code>
                  <TextField
                    size="small"
                    value={draft[r.id] ?? r.label}
                    onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    sx={{ minWidth: 220, flex: 1 }}
                    label="Libellé affiché"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="contained"
        color="success"
        className="!mt-4"
        disabled={saving || rows.length === 0}
        onClick={() => void save()}
        sx={{ textTransform: "none" }}
      >
        {saving ? "Enregistrement…" : "Enregistrer les libellés"}
      </Button>
    </Box>
  );
}
