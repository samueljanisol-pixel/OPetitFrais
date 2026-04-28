"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormControl, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useMagasinSaisie } from "../MagasinSaisieContext";

type Supplier = { id: string; code: string; label: string };

export default function NouvelleCommandePage() {
  const router = useRouter();
  const { loading: sLoading, can } = useSessionPermissions();
  const { magasinId, currentMagasin } = useMagasinSaisie();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sLoading || !can("commandes_fournisseur.saisie")) return;
    (async () => {
      const res = await fetch("/api/commandes-fournisseur/suppliers", { credentials: "include" });
      const j = (await res.json()) as { suppliers?: Supplier[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erreur");
        return;
      }
      setSuppliers(j.suppliers ?? []);
    })();
  }, [sLoading, can]);

  const create = async () => {
    if (!magasinId || !supplierId) {
      setErr("Choisissez un fournisseur");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/commandes-fournisseur/commandes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magasinId, supplierId: supplierId }),
      });
      const j = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erreur");
        return;
      }
      if (j.id) {
        void router.push(`/commandes-fournisseur/saisie/${j.id}/parcours`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (sLoading) {
    return <p className="px-4 py-6">Chargement…</p>;
  }

  if (!can("commandes_fournisseur.saisie")) {
    return null;
  }

  if (!currentMagasin) {
    return (
      <main className="px-4 py-6">
        <Typography color="error">Aucun magasin rattaché.</Typography>
        <Button component={AppLink} href="/commandes-fournisseur/saisie" className="!mt-4">
          Retour
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-4">
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }}>
        Nouvelle commande
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-4">
        {currentMagasin.nom}
      </Typography>

      <div className="flex flex-col gap-4">
        <FormControl fullWidth>
          <InputLabel id="fournisseur-label">Fournisseur</InputLabel>
          <Select
            labelId="fournisseur-label"
            label="Fournisseur"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value as string)}
          >
            {suppliers.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {err ? (
          <Typography color="error" variant="body2">
            {err}
          </Typography>
        ) : null}

        <Button variant="contained" color="success" onClick={() => void create()} disabled={saving} sx={{ textTransform: "none" }}>
          {saving ? "Création…" : "Commencer la saisie"}
        </Button>
        <Button component={AppLink} href="/commandes-fournisseur/saisie" color="inherit" sx={{ textTransform: "none" }}>
          Annuler
        </Button>
      </div>
    </main>
  );
}
