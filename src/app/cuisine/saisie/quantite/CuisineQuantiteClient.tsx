"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Box, Button, Stack, Typography } from "@mui/material";
import BackNavButton from "@/components/BackNavButton";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteJournalEntry,
  insertJournalEntry,
  loadJournalEntryById,
  updateJournalEntryQuantity,
} from "@/lib/cuisine/journal-queries";
import { useJournalDateLive } from "@/lib/cuisine/use-journal-day";
import { clampCuisineQuantity } from "@/lib/cuisine/clamp-quantity";
import { productDisplayName } from "@/lib/products/product-display-name";
import { productPhotoPublicUrl } from "@/lib/products/storage";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { CuisineEntryType, CuisineFrigoProduct, CuisineJournalEntryWithProduct } from "@/lib/cuisine/types";
import CuisineQuantityStepper from "./CuisineQuantityStepper";

function parseEntryType(raw: string | null): CuisineEntryType | null {
  if (raw === "entree" || raw === "sortie") return raw;
  return null;
}

function salesUnitLabel(product: CuisineFrigoProduct | null): string {
  const su = product?.ref_sales_unit;
  const o = Array.isArray(su) ? su[0] : su;
  return o?.label?.trim() || "";
}

export default function CuisineQuantiteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entryId");
  const productId = searchParams.get("productId");
  const entryTypeParam = parseEntryType(searchParams.get("type"));

  const t = useTranslations("backoffice.cuisine.quantite");
  const tCommon = useTranslations("common");
  const locale = useAppLocale();
  const { loading: permLoading, canCuisineSaisie } = useSessionPermissions();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const journalDate = useJournalDateLive();

  const [entry, setEntry] = useState<CuisineJournalEntryWithProduct | null>(null);
  const [product, setProduct] = useState<CuisineFrigoProduct | null>(null);
  const [entryType, setEntryType] = useState<CuisineEntryType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(entryId);

  useEffect(() => {
    if (!permLoading && !canCuisineSaisie) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, canCuisineSaisie, router]);

  useEffect(() => {
    if (!canCuisineSaisie) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErr(null);

      if (entryId) {
        const { entry: row, error } = await loadJournalEntryById(supabase, entryId);
        if (cancelled) return;
        if (error) {
          setErr(error);
          setLoading(false);
          return;
        }
        if (!row) {
          setErr(t("entryNotFound"));
          setLoading(false);
          return;
        }
        setEntry(row);
        setProduct(row.product);
        setEntryType(row.entry_type);
        setQuantity(clampCuisineQuantity(row.quantity));
        setLoading(false);
        return;
      }

      if (!productId || !entryTypeParam) {
        void router.replace("/cuisine/saisie");
        return;
      }

      const { data, error } = await supabase
        .from("product")
        .select(
          "id, code, name, name_ar, image_path, subcategory_id, ref_subcategory(id, label, sort_order), ref_sales_unit(label)",
        )
        .eq("id", productId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setErr(t("productNotFound"));
        setLoading(false);
        return;
      }

      setProduct(data as CuisineFrigoProduct);
      setEntryType(entryTypeParam);
      setQuantity(1);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [canCuisineSaisie, entryId, productId, entryTypeParam, supabase, router, t]);

  const photoUrl = productPhotoPublicUrl(supabase, product?.image_path ?? null);
  const unit = salesUnitLabel(product);
  const displayName = product ? productDisplayName(product, locale) : "—";

  const title =
    entryType === "entree" ? t("titleEntree") : entryType === "sortie" ? t("titleSortie") : t("title");

  const stepperLabels = useMemo(
    () => ({
      minusTen: t("stepper.minusTen"),
      minusOne: t("stepper.minusOne"),
      plusOne: t("stepper.plusOne"),
      plusTen: t("stepper.plusTen"),
    }),
    [t],
  );

  const save = useCallback(async () => {
    if (!entryType || !product) return;
    setSaving(true);
    setErr(null);
    const qty = clampCuisineQuantity(quantity);

    if (isEdit && entry) {
      const { error } = await updateJournalEntryQuantity(supabase, entry.id, qty);
      if (error) {
        setErr(error);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await insertJournalEntry(supabase, {
        journal_date: journalDate,
        entry_type: entryType,
        product_id: product.id,
        quantity: qty,
      });
      if (error) {
        setErr(error);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    void router.replace("/cuisine/saisie");
  }, [entryType, product, quantity, isEdit, entry, supabase, journalDate, router]);

  const remove = useCallback(async () => {
    if (!entry) return;
    setSaving(true);
    setErr(null);
    const { error } = await deleteJournalEntry(supabase, entry.id);
    if (error) {
      setErr(error);
      setSaving(false);
      return;
    }
    setSaving(false);
    void router.replace("/cuisine/saisie");
  }, [entry, supabase, router]);

  if (permLoading || loading) {
    return <p className="px-4 py-6 text-slate-600">{tCommon("loading")}</p>;
  }

  if (!canCuisineSaisie) return null;

  const cancelHref = isEdit
    ? "/cuisine/saisie"
    : `/cuisine/saisie/ajouter?type=${entryType ?? "entree"}`;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <BackNavButton href={cancelHref}>
        {tCommon("back")}
      </BackNavButton>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mt: 1, mb: 2 }}>
        {title}
      </Typography>

      <Stack spacing={2} sx={{ mb: 3, alignItems: "center" }}>
        {photoUrl ? (
          <Box
            sx={{
              position: "relative",
              width: 120,
              height: 120,
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "grey.50",
              p: 0.75,
            }}
          >
            <Image src={photoUrl} alt="" fill sizes="120px" style={{ objectFit: "contain", objectPosition: "center" }} />
          </Box>
        ) : null}
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, textAlign: "center" }}
          dir={locale === "ar-MA" ? "rtl" : undefined}
        >
          {displayName}
        </Typography>
      </Stack>

      <CuisineQuantityStepper
        value={quantity}
        onChange={setQuantity}
        unitLabel={unit || undefined}
        labels={stepperLabels}
      />

      {err ? (
        <Typography color="error" sx={{ mt: 2, textAlign: "center" }}>
          {err}
        </Typography>
      ) : null}

      <Stack spacing={1.5} sx={{ mt: 4 }}>
        <Button
          variant="contained"
          color="success"
          fullWidth
          disabled={saving || !product || !entryType}
          onClick={() => void save()}
          sx={{ textTransform: "none", py: 1.25 }}
        >
          {saving ? tCommon("loading") : tCommon("save")}
        </Button>
        <Button
          variant="outlined"
          color="error"
          fullWidth
          disabled={saving}
          onClick={() => router.replace(cancelHref)}
          sx={{ textTransform: "none", py: 1.25, borderWidth: 2 }}
        >
          {tCommon("cancel")}
        </Button>
        {isEdit ? (
          <Button
            variant="outlined"
            color="error"
            fullWidth
            disabled={saving}
            onClick={() => void remove()}
            sx={{ textTransform: "none" }}
          >
            {tCommon("delete")}
          </Button>
        ) : null}
      </Stack>
    </main>
  );
}
