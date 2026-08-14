"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from "@mui/material";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import { defaultDeliveryDateIso } from "@/lib/commandes-fournisseur/delivery-date";
import { useMagasinSaisie } from "../MagasinSaisieContext";

type Supplier = { id: string; code: string; label: string; usesDeliveryDate?: boolean };

export default function NouvelleCommandePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: sLoading, can } = useSessionPermissions();
  const { magasinId, currentMagasin } = useMagasinSaisie();
  const t = useTranslations("backoffice.commandes.saisie.nouvelle");
  const tc = useTranslations("backoffice.commandes.common");
  const te = useTranslations("backoffice.commandes.errors");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [dateLivraison, setDateLivraison] = useState(() => defaultDeliveryDateIso());
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sLoading || !can("commandes_fournisseur.saisie")) return;
    (async () => {
      const res = await fetch("/api/commandes-fournisseur/suppliers", { credentials: "include" });
      const j = (await res.json()) as { suppliers?: Supplier[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? te("generic"));
        return;
      }
      setSuppliers(j.suppliers ?? []);
    })();
  }, [sLoading, can, te]);

  useEffect(() => {
    if (suppliers.length === 0) return;
    const supplierCode = searchParams.get("supplier")?.trim();
    if (!supplierCode) return;
    const match = suppliers.find((s) => s.code === supplierCode);
    if (match) {
      setSupplierId(match.id);
    }
  }, [suppliers, searchParams]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );
  const showDeliveryDate = Boolean(selectedSupplier?.usesDeliveryDate);

  const create = async () => {
    if (!magasinId || !supplierId) {
      setErr(te("chooseSupplier"));
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/commandes-fournisseur/commandes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          magasinId,
          supplierId: supplierId,
          ...(showDeliveryDate ? { dateLivraison } : {}),
        }),
      });
      const j = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? te("generic"));
        return;
      }
      if (j.id) {
        void router.push(`/commandes-fournisseur/saisie/${j.id}/parcours`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setSaving(false);
    }
  };

  if (sLoading) {
    return <p className="px-4 py-6">{tCommon("loading")}</p>;
  }

  if (!can("commandes_fournisseur.saisie")) {
    return null;
  }

  if (!currentMagasin) {
    return (
      <main className="px-4 py-6">
        <Typography color="error">{te("noStoreLinkedShort")}</Typography>
        <Button
          component={AppLink}
          href="/commandes-fournisseur/saisie"
          className="!mt-4"
          startIcon={<BackChevron fontSize="small" />}
        >
          {tc("back")}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-4">
      <Button
        component={AppLink}
        href="/commandes-fournisseur/saisie"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{
          textTransform: "none",
          mb: 1,
          alignSelf: "flex-start",
          pl: 0,
          minHeight: 36,
          fontWeight: 500,
        }}
      >
        {tc("back")}
      </Button>
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }}>
        {t("title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-4">
        {currentMagasin.nom}
      </Typography>

      <div className="flex flex-col gap-4">
        <FormControl fullWidth>
          <InputLabel id="fournisseur-label">{tc("supplier")}</InputLabel>
          <Select
            labelId="fournisseur-label"
            label={tc("supplier")}
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

        {showDeliveryDate ? (
          <TextField
            label={tc("deliveryDateLabel")}
            type="date"
            value={dateLivraison}
            onChange={(e) => setDateLivraison(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        ) : null}

        {err ? (
          <Typography color="error" variant="body2">
            {err}
          </Typography>
        ) : null}

        <Button variant="contained" color="success" onClick={() => void create()} disabled={saving} sx={{ textTransform: "none" }}>
          {saving ? t("creating") : t("startEntry")}
        </Button>
        <Button component={AppLink} href="/commandes-fournisseur/saisie" color="inherit" sx={{ textTransform: "none" }}>
          {tCommon("cancel")}
        </Button>
      </div>
    </main>
  );
}
