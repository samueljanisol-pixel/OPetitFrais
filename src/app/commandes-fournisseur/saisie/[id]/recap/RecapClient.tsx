"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  List,
  ListItem,
  Divider,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CommentOutlinedIcon from "@mui/icons-material/CommentOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import LigneSaisieComments from "@/components/commandes-fournisseur/LigneSaisieComments";
import AppLink from "@/components/AppLink";
import ProductArabicSubtitle from "@/components/ProductArabicSubtitle";
import CommandeFournisseurProductPicker, {
  type ProductPickRow,
} from "@/features/commandes-fournisseur/CommandeFournisseurProductPicker";
import {
  ParcoursProductQuantityPanel,
  packArray,
  parcoursShapeFromPickRow,
  pKeyForProduct,
  uKeyForProduct,
  useSingleProductParcoursQuantity,
} from "@/features/commandes-fournisseur/parcours-product-quantity";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { DecimalQtyTextField } from "@/components/commandes-fournisseur/DecimalQtyTextField";
import { commandeLigneKey } from "@/lib/commandes-fournisseur/commande-ligne-key";
import {
  buildSoitLineForLocale,
  recapCondTitreForLocale,
  type PackagingRowForDisplay,
} from "@/lib/commandes-fournisseur/product-display";
import { clampQtyToApiRange, roundQty2 } from "@/lib/commandes-fournisseur/qty-parse";
import CommandeSaisieRecapExport from "@/features/commandes-fournisseur/CommandeSaisieRecapExport";
import type { VendeurRef } from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import type { AppLocale } from "@/i18n/config";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type Ligne = {
  id: string;
  product_id: string;
  product_packaging_id: string | null;
  qte: number;
  line_comment: string | null;
  hors_fournisseur: boolean;
  vendeur_id?: string | null;
  product: { name: string; code: string; name_ar?: string | null; ref_sales_unit?: unknown } | null;
  /** Unité de vente du produit (réf. produit) : affichage à l’unité. */
  uniteVente?: string;
  /** UdV du conditionnement (pour « Soit … »). */
  condPackUniteVente?: string | null;
  condTitre?: string | null;
  /** Quantité contenu par conditionnement (product_packaging.quantity), pour le calcul Soit. */
  packContentQty?: number | null;
  /** UdV du conditionnement = « Unité » : « Soit … » en unité(s), pas en UdV poids/volume. */
  packSalesUnitIsUnite?: boolean;
  /** Données colis pour libellés localisés (arabe / français). */
  packaging?: PackagingRowForDisplay | null;
  /** Libellé catégorie (pour regroupement récap) ; absent avant rechargement après ajout ponctuel. */
  categoryLabel?: string | null;
};

type Commande = {
  id: string;
  status: string;
  commentaire: string | null;
  supplier_id: string;
  magasin_id: string;
  ref_supplier: { label: string } | { label: string }[] | null;
};

function supplierLabel(c: Commande, emDash: string): string {
  const r = c.ref_supplier;
  if (!r) return emDash;
  const x = Array.isArray(r) ? r[0] : r;
  return (x as { label?: string })?.label ?? emDash;
}

function formatSoit(
  n: number,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return formatNumber(n, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Grille fixe : ± | qté | unité | ± — même gabarit sur toutes les lignes (avec ou sans « Soit »). */
const QTE_GRID_ROW =
  "grid shrink-0 grid-cols-[2.35rem_4.25rem_2.25rem_2.35rem] items-center gap-x-0.5 sm:grid-cols-[2.5rem_4.25rem_2.25rem_2.5rem] sm:gap-x-1";

const QTE_STEP_BTN = "!min-w-0 !w-full !max-w-full !px-1 sm:!px-2";

const QTE_FIELD_SX = {
  "& .MuiInputBase-input": { py: 0.65, textAlign: "center" as const, px: 0.5 },
  width: "100%",
  minWidth: 0,
  maxWidth: "none",
};

const QTE_UNIT_CELL = "min-w-0 truncate text-left";

const QTE_SOIT_CELL =
  "col-span-2 min-w-0 whitespace-nowrap text-center text-[0.8125rem] leading-tight tabular-nums sm:text-sm";

const QTE_COND_TITRE_CELL = "col-span-4 min-w-0 text-center leading-tight";

function recapLigneCondDisplay(
  l: Ligne,
  locale: AppLocale,
  tc: (key: "soitLine", values: { qty: string; unit: string }) => string,
): { condTitre: string | null; soitLine: string | null } {
  const isCond = Boolean(l.product_packaging_id);
  const pack = l.packaging ?? null;
  const condTitre = recapCondTitreForLocale(l.condTitre, pack, locale);
  const display = {
    uniteVente: l.uniteVente ?? "—",
    condPackUniteVente: l.condPackUniteVente ?? null,
    condTitre,
    packContentQty: isCond ? (l.packContentQty ?? null) : null,
    isCond,
    packSalesUnitIsUnite: l.packSalesUnitIsUnite === true,
  };
  const soitLine = buildSoitLineForLocale(
    display,
    l.qte,
    locale,
    pack,
    (qty, unit) => tc("soitLine", { qty, unit }),
  );
  return { condTitre, soitLine };
}

function RecapCondTitre({ label }: { label: string }) {
  return (
    <div className={QTE_GRID_ROW}>
      <Typography
        variant="caption"
        color="text.secondary"
        component="span"
        className={QTE_COND_TITRE_CELL}
      >
        {label}
      </Typography>
    </div>
  );
}

function StepQte({
  value,
  uniteVente,
  onChange,
  hideUnit,
  soitLine,
  decreaseByOneAria,
  minQtyRemoveLineAria,
  quantityProductAria,
}: {
  value: number;
  uniteVente: string;
  onChange: (n: number) => void;
  /** Conditionnement : pas d’unité de vente à droite de la quantité. */
  hideUnit?: boolean;
  /** Conversion UdV produit, centrée sous le champ quantité. */
  soitLine?: string | null;
  decreaseByOneAria: string;
  minQtyRemoveLineAria: string;
  quantityProductAria: string;
}) {
  const step =
    (d: number) => () =>
      onChange(Math.max(0, roundQty2(roundQty2(value) + d)));
  return (
    <div className="flex max-w-full shrink-0 flex-col items-stretch gap-0.5">
      <div className={QTE_GRID_ROW}>
        <Button
          size="small"
          variant="outlined"
          className={QTE_STEP_BTN}
          sx={{ py: 0.5 }}
          onClick={() => step(-1)()}
          disabled={value < 1}
          aria-label={value < 1 ? minQtyRemoveLineAria : decreaseByOneAria}
        >
          -1
        </Button>
        <DecimalQtyTextField
          size="small"
          value={clampQtyToApiRange(value)}
          onQtyChange={(n) => onChange(clampQtyToApiRange(n))}
          sx={QTE_FIELD_SX}
          slotProps={{ htmlInput: { "aria-label": quantityProductAria } }}
        />
        {hideUnit ? (
          <span className={QTE_UNIT_CELL} aria-hidden />
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            className={QTE_UNIT_CELL}
            title={uniteVente}
          >
            {uniteVente}
          </Typography>
        )}
        <Button
          size="small"
          variant="outlined"
          className={QTE_STEP_BTN}
          sx={{ py: 0.5 }}
          onClick={() => step(1)()}
        >
          +1
        </Button>
      </div>
      {soitLine ? (
        <div className={QTE_GRID_ROW}>
          <span aria-hidden />
          <Typography
            variant="body2"
            color="text.secondary"
            component="p"
            className={QTE_SOIT_CELL}
          >
            {soitLine}
          </Typography>
          <span aria-hidden />
        </div>
      ) : null}
    </div>
  );
}

export default function RecapClient({ commandeId }: { commandeId: string }) {
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.recap");
  const tc = useTranslations("backoffice.commandes.common");
  const te = useTranslations("backoffice.commandes.errors");
  const tStatus = useTranslations("backoffice.status");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { formatNumber, locale } = useAppFormat();
  const { labelFor } = useStatusLabels();
  const [commande, setCommande] = useState<Commande | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [vendeurs, setVendeurs] = useState<VendeurRef[]>([]);
  const [saisieParLabel, setSaisieParLabel] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [condDialogOpen, setCondDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ProductPickRow | null>(null);
  const [lineCommentIndex, setLineCommentIndex] = useState<number | null>(null);
  const [lineCommentDraft, setLineCommentDraft] = useState("");

  const parcoursPending = pendingProduct ? parcoursShapeFromPickRow(pendingProduct) : null;
  const seedLignesForPending = useMemo(() => {
    if (!pendingProduct) {
      return undefined;
    }
    return lignes
      .filter((l) => l.product_id === pendingProduct.id)
      .map((l) => ({ product_packaging_id: l.product_packaging_id, qte: l.qte }));
  }, [lignes, pendingProduct]);
  const hasExistingLinesForPending = (seedLignesForPending?.length ?? 0) > 0;
  const {
    allSnapshots: condAllSnapshots,
    panelProps: condPanelProps,
    getQ: condGetQ,
  } = useSingleProductParcoursQuantity(parcoursPending, condDialogOpen, commande?.supplier_id ?? null, {
    seedLignes: seedLignesForPending,
    multiPackaging: true,
  });
  const canConfirmCondDialog =
    condAllSnapshots.length > 0 || hasExistingLinesForPending;

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, { credentials: "include" });
      const j = (await res.json()) as {
        commande?: Commande;
        lignes?: Ligne[];
        vendeurs?: VendeurRef[];
        saisieParLabel?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setErr(j.error ?? te("generic"));
        return;
      }
      if (j.commande) {
        setCommande(j.commande);
        setComment(j.commande.commentaire ?? "");
      }
      setLignes(j.lignes ?? []);
      setVendeurs(j.vendeurs ?? []);
      setSaisieParLabel(typeof j.saisieParLabel === "string" ? j.saisieParLabel : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setLoading(false);
    }
  }, [commandeId, te]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = commande?.status === "en_saisie";
  const canExportRecapImage =
    !editable &&
    lignes.length > 0 &&
    (commande?.status === "validee" || commande?.status === "integree");

  const putLignes = useCallback(
    async (list: Ligne[]) => {
      const payload = list.map((l) => ({
        productId: l.product_id,
        productPackagingId: l.product_packaging_id,
        qte: l.qte,
        lineComment: l.line_comment,
        horsFournisseur: l.hors_fournisseur,
      }));
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}/lignes`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lignes: payload }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? te("saveLinesFailed"));
      }
    },
    [commandeId, te],
  );

  const persistLignes = useCallback(async () => {
    await putLignes(lignes);
  }, [lignes, putLignes]);

  const saveComment = useCallback(async () => {
    const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentaire: comment }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(j.error ?? te("commentFailed"));
    }
  }, [commandeId, comment, te]);

  const onValidate = useCallback(async () => {
    setErr(null);
    setSaving(true);
    try {
      if (editable) {
        await persistLignes();
        await saveComment();
      }
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "validee" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? te("validationFailed"));
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setSaving(false);
    }
  }, [commandeId, editable, load, persistLignes, router, saveComment, te]);

  const executeCancelOrder = useCallback(async () => {
    setCancelDialogOpen(false);
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? te("cancellationFailed"));
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setSaving(false);
    }
  }, [commandeId, load, router, te]);

  const onRouvrir = useCallback(async () => {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "en_saisie" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? te("reopenFailed"));
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setSaving(false);
    }
  }, [commandeId, load, router, te]);

  const setLigneQte = (i: number, q: number) => {
    setLignes((prev) => {
      const next = [...prev];
      const row = next[i];
      if (!row) return prev;
      next[i] = { ...row, qte: q };
      return next;
    });
  };

  const openLineComment = useCallback(
    (i: number) => {
      const row = lignes[i];
      if (!row) return;
      setLineCommentIndex(i);
      setLineCommentDraft(row.line_comment ?? "");
    },
    [lignes],
  );

  const closeLineComment = useCallback(() => {
    setLineCommentIndex(null);
    setLineCommentDraft("");
  }, []);

  const saveLineComment = useCallback(async () => {
    if (!editable || lineCommentIndex === null) return;
    const row = lignes[lineCommentIndex];
    if (!row) return;
    const trimmed = lineCommentDraft.trim();
    setErr(null);
    setSaving(true);
    try {
      const next = [...lignes];
      next[lineCommentIndex] = {
        ...row,
        line_comment: trimmed.length > 0 ? trimmed : null,
      };
      await putLignes(next);
      setLignes(next);
      closeLineComment();
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setSaving(false);
    }
  }, [closeLineComment, editable, lineCommentDraft, lineCommentIndex, lignes, putLignes, te]);

  const deleteLineComment = useCallback(async () => {
    if (!editable || lineCommentIndex === null) return;
    const row = lignes[lineCommentIndex];
    if (!row) return;
    if (!row.line_comment?.trim()) {
      closeLineComment();
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const next = [...lignes];
      next[lineCommentIndex] = { ...row, line_comment: null };
      await putLignes(next);
      setLignes(next);
      closeLineComment();
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setSaving(false);
    }
  }, [closeLineComment, editable, lineCommentIndex, lignes, putLignes, te]);

  const onDeleteLigne = useCallback(
    async (i: number) => {
      if (!editable) return;
      const row = lignes[i];
      if (!row) return;
      const name = row.product?.name?.trim() || row.product_id;
      if (!window.confirm(t("deleteLineConfirm", { productName: name }))) {
        return;
      }
      setErr(null);
      setSaving(true);
      try {
        const next = lignes.filter((_, j) => j !== i);
        await putLignes(next);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : te("generic"));
      } finally {
        setSaving(false);
      }
    },
    [editable, lignes, load, putLignes, t, te],
  );

  const newLigneFromPick = useCallback(
    (p: ProductPickRow, productPackagingId: string | null, qte: number): Ligne => ({
      id: `tmp-${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`,
      product_id: p.id,
      product_packaging_id: productPackagingId,
      qte,
      line_comment: null,
      hors_fournisseur: false,
      product: {
        name: p.name,
        code: p.code,
        name_ar: p.name_ar ?? null,
      },
    }),
    [],
  );

  /** Fusionne unité + conditionnements saisis dans le dialogue (ajout ou mise à jour). */
  const applyProductQtyFromDialog = useCallback(
    async (p: ProductPickRow, getQ: (key: string) => number): Promise<boolean> => {
      if (!editable || !commande) {
        return false;
      }
      const shape = parcoursShapeFromPickRow(p);
      const packs = packArray(shape.product_packaging);
      const managedKeys = new Set<string>([
        commandeLigneKey(p.id, null),
        ...packs.map((pk) => commandeLigneKey(p.id, pk.id)),
      ]);
      const active: { productPackagingId: string | null; qte: number }[] = [];
      const uq = getQ(uKeyForProduct(p.id));
      if (uq > 0) {
        active.push({ productPackagingId: null, qte: uq });
      }
      for (const pkg of packs) {
        const q = getQ(pKeyForProduct(p.id, pkg.id));
        if (q > 0) {
          active.push({ productPackagingId: pkg.id, qte: q });
        }
      }
      const activeKeys = new Set(
        active.map((a) => commandeLigneKey(p.id, a.productPackagingId)),
      );

      let next = lignes.filter((l) => {
        if (l.product_id !== p.id) {
          return true;
        }
        const key = commandeLigneKey(l.product_id, l.product_packaging_id);
        if (!managedKeys.has(key)) {
          return true;
        }
        return activeKeys.has(key);
      });

      for (const { productPackagingId, qte } of active) {
        const key = commandeLigneKey(p.id, productPackagingId);
        const idx = next.findIndex(
          (l) => commandeLigneKey(l.product_id, l.product_packaging_id) === key,
        );
        if (idx >= 0) {
          next[idx] = { ...next[idx]!, qte };
        } else {
          next = [...next, newLigneFromPick(p, productPackagingId, qte)];
        }
      }

      setErr(null);
      setSaving(true);
      try {
        await putLignes(next);
        await load();
        return true;
      } catch (e) {
        setErr(e instanceof Error ? e.message : te("generic"));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [commande, editable, lignes, load, newLigneFromPick, putLignes, te],
  );

  const handleProductPicked = useCallback(
    (p: ProductPickRow) => {
      if (!editable || !commande) {
        return;
      }
      setPickerOpen(false);
      const packs = packArray(parcoursShapeFromPickRow(p).product_packaging);
      if (packs.length > 0) {
        setPendingProduct(p);
        setCondDialogOpen(true);
        return;
      }
      void applyProductQtyFromDialog(p, (k) => (k === uKeyForProduct(p.id) ? 1 : 0));
    },
    [applyProductQtyFromDialog, commande, editable],
  );

  const handleCondDialogConfirm = useCallback(() => {
    if (!pendingProduct || !canConfirmCondDialog) {
      return;
    }
    void (async () => {
      const ok = await applyProductQtyFromDialog(pendingProduct, condGetQ);
      if (ok) {
        setCondDialogOpen(false);
        setPendingProduct(null);
      }
    })();
  }, [applyProductQtyFromDialog, canConfirmCondDialog, condGetQ, pendingProduct]);

  const handleCondDialogClose = useCallback(() => {
    setCondDialogOpen(false);
    setPendingProduct(null);
  }, []);

  if (loading) {
    return <p className="px-4 py-4">{tc("loading")}</p>;
  }

  if (err && !commande) {
    return (
      <main className="px-4 py-4">
        <Typography color="error">{err}</Typography>
      </main>
    );
  }

  if (!commande) {
    return null;
  }
  const emDash = tc("emDash");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
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
        {t("backToList")}
      </Button>
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }}>
        {t("title")}
      </Typography>
      <div className="!mb-4 flex flex-col gap-1">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} component="p" className="!m-0">
          {tc("supplierColon", { label: supplierLabel(commande, emDash) })}
        </Typography>
        <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 700 }} component="p" className="!m-0">
          {labelFor("commande_fournisseur", commande.status)}
        </Typography>
      </div>

      {err ? (
        <Typography color="error" className="!mb-2" variant="body2">
          {err}
        </Typography>
      ) : null}

      {canExportRecapImage && commande ? (
        <CommandeSaisieRecapExport
          commande={commande}
          supplierLabel={supplierLabel(commande, emDash)}
          lignes={lignes}
          vendeurs={vendeurs}
          saisieParLabel={saisieParLabel}
        />
      ) : null}

      {editable ? (
        <div className="!mb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <Button
            component={AppLink}
            href={`/commandes-fournisseur/saisie/${commandeId}/parcours`}
            variant="outlined"
            size="small"
            sx={{ textTransform: "none" }}
          >
            {t("productTour")}
          </Button>
          <Button
            type="button"
            variant="outlined"
            size="small"
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            {tc("addProduct")}
          </Button>
        </div>
      ) : null}
      {lignes.length > 0 ? (
        <Typography variant="body2" color="text.secondary" className="!mb-2" sx={{ fontWeight: 600 }}>
          {tStatus("productCount", { count: lignes.length })}
        </Typography>
      ) : null}
      {editable ? (
      <List dense disablePadding>
        {lignes.map((l, i) => {
          const u = l.uniteVente ?? emDash;
          const isCond = Boolean(l.product_packaging_id);
          const { condTitre: condTitreDisplay, soitLine: soitCond } = recapLigneCondDisplay(l, locale, tc);
          const catKey = (l.categoryLabel ?? "").trim() || tc("noCategory");
          const prevCat =
            i > 0 ? ((lignes[i - 1]!.categoryLabel ?? "").trim() || tc("noCategory")) : null;
          const showCategoryHeader = i === 0 || catKey !== prevCat;
          return (
            <Fragment key={l.id}>
              {showCategoryHeader ? (
                <ListItem
                  component="li"
                  disableGutters
                  className={`!flex-col !items-stretch ${i > 0 ? "!mt-2" : "!mt-0"} !mb-1`}
                  sx={{
                    borderRadius: 1,
                    px: 1.25,
                    py: 0.75,
                    bgcolor: (t) =>
                      t.palette.mode === "dark"
                        ? alpha(t.palette.success.main, 0.18)
                        : alpha(t.palette.success.main, 0.1),
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    component="div"
                    color="success"
                    className="w-full"
                    sx={{ fontWeight: 700, letterSpacing: "0.02em" }}
                  >
                    {catKey}
                  </Typography>
                </ListItem>
              ) : null}
              <ListItem disableGutters className="!flex-col !items-stretch !mb-2">
              <div className="flex w-full min-w-0 items-start justify-between gap-1.5 sm:gap-2">
                <div className="min-w-0 flex-1 overflow-hidden pr-0 sm:pr-1">
                  <Typography variant="body2" className="!font-medium">
                    {l.product?.name ?? l.product_id}
                  </Typography>
                  <ProductArabicSubtitle nameAr={l.product?.name_ar} matchNameLine />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <>
                    <div className="flex items-start gap-0.5">
                      <div className="flex flex-col items-stretch gap-0.5">
                        {condTitreDisplay ? <RecapCondTitre label={condTitreDisplay} /> : null}
                        <StepQte
                          value={l.qte}
                          uniteVente={u}
                          hideUnit={isCond}
                          soitLine={soitCond}
                          decreaseByOneAria={tc("decreaseByOneAria")}
                          minQtyRemoveLineAria={tc("minQtyRemoveLineAria")}
                          quantityProductAria={tc("quantityProductAria")}
                          onChange={(q) => setLigneQte(i, q)}
                        />
                      </div>
                      <IconButton
                        type="button"
                        size="small"
                        color="error"
                        aria-label={tc("removeLineAria")}
                        onClick={() => void onDeleteLigne(i)}
                        disabled={saving}
                        className="!mt-0.5"
                      >
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </div>
                    <div className="flex max-w-full items-start justify-end gap-0.5">
                      {l.line_comment ? (
                        <LigneSaisieComments
                          comments={[]}
                          lineComment={l.line_comment}
                          variant="chip"
                        />
                      ) : null}
                      <IconButton
                        type="button"
                        size="small"
                        color={l.line_comment ? "info" : "default"}
                        aria-label={
                          l.line_comment ? tc("editCommentAria") : tc("addCommentAria")
                        }
                        onClick={() => openLineComment(i)}
                        disabled={saving}
                        sx={{ flexShrink: 0 }}
                      >
                        <CommentOutlinedIcon fontSize="small" />
                      </IconButton>
                    </div>
                    </>
                </div>
              </div>
              <Divider className="!my-2" />
            </ListItem>
            </Fragment>
          );
        })}
      </List>
      ) : (
        <Table
          size="small"
          className="!mb-2"
          sx={{
            "& .MuiTableCell-root": { py: 1, px: 1, verticalAlign: "top" },
            "& .MuiTableHead-root .MuiTableCell-root": { fontWeight: 700 },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell>Produit</TableCell>
              <TableCell align="right" sx={{ minWidth: 72 }}>
                {tc("quantity")}
              </TableCell>
              <TableCell sx={{ minWidth: 120 }}>{tc("udvCond")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lignes.map((l, i) => {
              const u = l.uniteVente ?? emDash;
              const isCond = Boolean(l.product_packaging_id);
              const { condTitre: condTitreDisplay, soitLine: soitCond } = recapLigneCondDisplay(
                l,
                locale,
                tc,
              );
              const udvMain =
                isCond && condTitreDisplay ? condTitreDisplay : u !== emDash ? u : emDash;
              const udvSub = soitCond;
              const catKey = (l.categoryLabel ?? "").trim() || tc("noCategory");
              const prevCat =
                i > 0 ? ((lignes[i - 1]!.categoryLabel ?? "").trim() || tc("noCategory")) : null;
              const showCategoryHeader = i === 0 || catKey !== prevCat;
              return (
                <Fragment key={l.id}>
                  {showCategoryHeader ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        sx={{
                          py: 0.85,
                          bgcolor: (t) =>
                            t.palette.mode === "dark"
                              ? alpha(t.palette.success.main, 0.18)
                              : alpha(t.palette.success.main, 0.1),
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          color="success"
                          component="div"
                          sx={{ fontWeight: 700, letterSpacing: "0.02em" }}
                        >
                          {catKey}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow>
                    <TableCell>
                      <Typography variant="body2" className="!font-medium">
                        {l.product?.name ?? l.product_id}
                      </Typography>
                      <ProductArabicSubtitle nameAr={l.product?.name_ar} matchNameLine />
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        sx={{
                          display: "inline-flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 0.5,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <Typography variant="body2" className="font-medium tabular-nums">
                          {formatSoit(l.qte, formatNumber)}
                        </Typography>
                        {l.line_comment ? (
                          <LigneSaisieComments
                            comments={[]}
                            lineComment={l.line_comment}
                            variant="chip"
                          />
                        ) : null}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "inline-flex", flexDirection: "column", gap: 0.25 }}>
                        <Typography variant="body2" component="div" sx={{ lineHeight: 1.3 }}>
                          {udvMain}
                        </Typography>
                        {udvSub ? (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            component="div"
                            sx={{ lineHeight: 1.3 }}
                          >
                            {udvSub}
                          </Typography>
                        ) : null}
                      </Box>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}

      {lignes.length === 0 ? (
        <Typography variant="body2" color="text.secondary" className="!mb-4">
          {editable
            ? t("emptyEditable")
            : t("emptyReadOnly")}
        </Typography>
      ) : null}

      <TextField
        fullWidth
        multiline
        minRows={2}
        label={t("orderCommentLabel")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => {
          if (editable) void saveComment().catch(() => undefined);
        }}
        disabled={!editable}
        size="small"
        className="!mb-4 !mt-4"
      />

      <div className="flex flex-col gap-2">
        {editable ? (
          <Button variant="contained" color="success" fullWidth onClick={() => void onValidate()} disabled={saving} sx={{ textTransform: "none" }}>
            {saving ? tc("loadingEllipsis") : t("validateOrder")}
          </Button>
        ) : null}

        {commande.status === "validee" ? (
          <Button variant="outlined" color="warning" fullWidth onClick={() => void onRouvrir()} disabled={saving} sx={{ textTransform: "none" }}>
            {saving ? tc("loadingEllipsis") : t("reopenForEdit")}
          </Button>
        ) : null}

        {commande.status === "integree" ? (
          <Typography variant="body2" color="text.secondary">
            {t("integratedNotice")}
          </Typography>
        ) : null}

        {(commande.status === "en_saisie" || commande.status === "validee") ? (
          <Button
            type="button"
            variant="outlined"
            color="error"
            fullWidth
            onClick={() => setCancelDialogOpen(true)}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            {t("cancelOrder")}
          </Button>
        ) : null}

        {commande.status === "annulee" ? (
          <Typography variant="body2" color="text.secondary">
            {t("cancelledNotice")}
          </Typography>
        ) : null}
      </div>

      {commande ? (
        <CommandeFournisseurProductPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          supplierId={commande.supplier_id}
          magasinId={commande.magasin_id}
          onSelect={handleProductPicked}
        />
      ) : null}

      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>{t("cancelDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t("cancelDialog.body", { statusLabel: labelFor("commande_fournisseur", "annulee") })}
          </Typography>
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button
            type="button"
            color="inherit"
            onClick={() => setCancelDialogOpen(false)}
            sx={{ textTransform: "none" }}
            disabled={saving}
          >
            {tCommon("back")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="error"
            disabled={saving}
            onClick={() => void executeCancelOrder()}
            sx={{ textTransform: "none" }}
          >
            {saving ? tc("loadingEllipsis") : t("cancelDialog.confirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={lineCommentIndex !== null} onClose={closeLineComment} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>
          {lineCommentDraft.trim().length > 0 || (lineCommentIndex !== null && lignes[lineCommentIndex]?.line_comment)
            ? tc("commentLine")
            : tc("addComment")}
        </DialogTitle>
        <DialogContent>
          {lineCommentIndex !== null ? (
            <Typography variant="subtitle2" className="!mb-2 !font-semibold">
              {lignes[lineCommentIndex]?.product?.name ?? lignes[lineCommentIndex]?.product_id}
            </Typography>
          ) : null}
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            label={tc("comment")}
            value={lineCommentDraft}
            onChange={(e) => setLineCommentDraft(e.target.value)}
            disabled={saving}
            placeholder={tc("commentPlaceholder")}
          />
        </DialogContent>
        <DialogActions
          className="!px-3 !pb-2"
          sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}
        >
          {lineCommentIndex !== null &&
          typeof lignes[lineCommentIndex]?.line_comment === "string" &&
          lignes[lineCommentIndex]!.line_comment!.trim().length > 0 ? (
            <Button
              type="button"
              color="error"
              disabled={saving}
              onClick={() => void deleteLineComment()}
              sx={{ textTransform: "none" }}
            >
              {saving ? tc("loadingEllipsis") : tCommon("delete")}
            </Button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex gap-1">
            <Button
              type="button"
              color="inherit"
              onClick={closeLineComment}
              sx={{ textTransform: "none" }}
              disabled={saving}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="contained"
              disabled={saving}
              onClick={() => void saveLineComment()}
              sx={{ textTransform: "none" }}
            >
              {saving ? tc("loadingEllipsis") : tCommon("save")}
            </Button>
          </div>
        </DialogActions>
      </Dialog>

      <Dialog open={condDialogOpen} onClose={handleCondDialogClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>{t("condDialog.title")}</DialogTitle>
        <DialogContent>
          {pendingProduct ? (
            <>
              <Typography variant="subtitle2" className="!mb-2 !font-semibold">
                {pendingProduct.name}
              </Typography>
              <ProductArabicSubtitle nameAr={pendingProduct.name_ar} matchNameLine />
              {condPanelProps ? <ParcoursProductQuantityPanel {...condPanelProps} /> : null}
            </>
          ) : null}
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button type="button" color="inherit" onClick={handleCondDialogClose} sx={{ textTransform: "none" }}>
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            disabled={saving || !canConfirmCondDialog}
            onClick={handleCondDialogConfirm}
            sx={{ textTransform: "none" }}
          >
            {hasExistingLinesForPending ? t("condDialog.saveExisting") : t("condDialog.addNew")}
          </Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
