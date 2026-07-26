"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ProductArabicSubtitle from "@/components/ProductArabicSubtitle";
import AppLink from "@/components/AppLink";
import FormDialog from "@/lib/mui/FormDialog";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { buildLotProductDisplayInfo, buildSoitLine, recapLigneQtyUnitLabel, type PackagingRowForDisplay } from "@/lib/commandes-fournisseur/product-display";
import CommandeFournisseurProductPicker, {
  type ProductPickRow,
} from "@/features/commandes-fournisseur/CommandeFournisseurProductPicker";
import {
  ParcoursProductQuantityPanel,
  packArray,
  parcoursShapeFromPickRow,
  useSingleProductParcoursQuantity,
} from "@/features/commandes-fournisseur/parcours-product-quantity";
import { DecimalQtyTextField } from "@/components/commandes-fournisseur/DecimalQtyTextField";
import LigneCommentaireSaisieControls from "@/components/commandes-fournisseur/LigneCommentaireSaisieControls";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import type { AppLocale } from "@/i18n/config";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import type {
  CommentaireMagasinCell,
  SaisieLigneTarget,
} from "@/lib/commandes-fournisseur/ligne-saisie-comments";
import { roundQty2 } from "@/lib/commandes-fournisseur/qty-parse";
import ValidationLotVendeurRecap from "@/features/commandes-fournisseur/ValidationLotVendeurRecap";
import LotConsolidationExportPanel from "@/features/commandes-fournisseur/LotConsolidationExportPanel";
import { useVendeurCommentPersistence } from "@/features/commandes-fournisseur/useVendeurCommentPersistence";
import { lotCommandeDateInfo } from "@/lib/commandes-fournisseur/lot-commande-date";
import { magasinCodeMx } from "@/lib/commandes-fournisseur/magasin-code-mx";
import type {
  MatrixGroupBy,
  RecapLigneInput,
  VendeurRef,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";
import { buildMatrixDisplayItems } from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

type ProductE = {
  id: string;
  name: string;
  name_ar?: string | null;
  code: string;
  ref_sales_unit?: unknown;
  ref_order_unit?: unknown;
  ref_category?: unknown;
  product_packaging?: unknown;
} | null;

type MagE = { id: string; code: string; nom: string } | { id: string; code: string; nom: string }[] | null;

type LotLigne = {
  id: string;
  product_id: string;
  vendeur_id?: string | null;
  /** Libellé affichage (GET lot tri comme récap commande). */
  categoryLabel?: string;
  /** Conditionnement retenu pour cette ligne ; null = quantités à l’unité de vente. */
  product_packaging_id: string | null;
  qte_achat: number | null;
  product: ProductE;
  commande_fournisseur_lot_ligne_magasin: {
    magasin_id: string;
    qte: number;
    magasins: MagE;
  }[];
  commentairesMagasin?: Record<string, CommentaireMagasinCell>;
  saisieLigneTargets?: SaisieLigneTarget[];
};

function targetsForMagasinCell(
  l: LotLigne,
  magasinId: string,
  magasinLabel: string,
): SaisieLigneTarget[] {
  const fromApi = (l.saisieLigneTargets ?? []).filter((t) => t.magasinId === magasinId);
  if (fromApi.length > 0) {
    return fromApi.map((t) => ({
      ...t,
      magasinLabel: t.magasinLabel || magasinLabel,
    }));
  }
  return [];
}

type Lot = {
  id: string;
  supplier_id: string;
  status: string;
  commentaire: string | null;
  created_at: string;
  marque_prete_at: string | null;
  ref_supplier: { label: string } | { label: string }[] | null;
  commande_fournisseur_lot_inclusion: {
    commande_fournisseur: {
      id: string;
      magasin_id: string;
      status: string;
      commentaire: string | null;
      created_at?: string;
      validated_at?: string | null;
      magasins: MagE;
    } | null;
  }[];
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function productName(p: ProductE): string {
  if (!p) return "—";
  return p.name ? String(p.name) : "—";
}

function magLabel(m: MagE): string {
  const o = one(
    m as
      | { nom?: string; code?: string }
      | { nom?: string; code?: string }[]
      | null
      | undefined,
  );
  if (!o) return "—";
  return o.nom ? String(o.nom) : String(o.code ?? "—");
}

/** Colonnes magasins : code MXX en en-tête, nom magasin pour aria / commentaires. */
function magasinColumnsFromLot(
  lot: Lot | null,
): { id: string; mxCode: string; storeLabel: string }[] {
  const mags: { id: string; mxCode: string; storeLabel: string }[] = [];
  const seen = new Set<string>();
  let idx = 0;
  for (const inc of lot?.commande_fournisseur_lot_inclusion ?? []) {
    const cf = inc.commande_fournisseur;
    if (!cf) {
      continue;
    }
    const id = cf.magasin_id;
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const code = one(
      cf.magasins as
        | { code?: string | null }
        | { code?: string | null }[]
        | null
        | undefined,
    )?.code;
    mags.push({
      id,
      mxCode: magasinCodeMx(code, idx),
      storeLabel: magLabel(cf.magasins),
    });
    idx += 1;
  }
  mags.sort((a, b) => a.mxCode.localeCompare(b.mxCode, "fr", { numeric: true }));
  return mags;
}

function magasinsForMagasinId(lot: Lot | null, magasinId: string): MagE {
  for (const inc of lot?.commande_fournisseur_lot_inclusion ?? []) {
    const cf = inc.commande_fournisseur;
    if (cf?.magasin_id === magasinId) {
      return cf.magasins;
    }
  }
  return null;
}

const LOT_CATEGORY_HEADER_BG_SX = {
  py: 1,
  px: 2,
  borderRadius: 1,
  bgcolor: (t: { palette: { mode: string; success: { main: string } } }) =>
    t.palette.mode === "dark"
      ? alpha(t.palette.success.main, 0.24)
      : alpha(t.palette.success.main, 0.16),
} as const;

const LOT_CATEGORY_HEADER_TEXT_SX = {
  width: "100%",
  textAlign: "center" as const,
  fontWeight: 700,
  fontSize: "1.0625rem",
  lineHeight: 1.25,
  letterSpacing: "0.03em",
} as const;

function packagingForLotLigne(
  p: ProductE,
  productPackagingId: string | null,
): PackagingRowForDisplay | null {
  if (!p || !productPackagingId) {
    return null;
  }
  const raw = p.product_packaging;
  const packs = !raw ? [] : Array.isArray(raw) ? raw : [raw];
  const pack = packs.find((row) => (row as { id?: string }).id === productPackagingId);
  return (pack as PackagingRowForDisplay | undefined) ?? null;
}

function lotLigneQtyUnitLabel(l: LotLigne, p: ProductE, locale: AppLocale): string {
  return recapLigneQtyUnitLabel(
    {
      product_packaging_id: l.product_packaging_id,
      packaging: packagingForLotLigne(p, l.product_packaging_id),
      product: p
        ? { ref_order_unit: p.ref_order_unit, ref_sales_unit: p.ref_sales_unit }
        : null,
    },
    locale,
  );
}

function normalizeProduct(raw: ProductE | unknown): ProductE {
  if (raw == null) return null;
  return one(raw as ProductE | ProductE[]);
}

/** Texte multi-lignes « Magasin : commentaire » pour les commandes ayant un commentaire non vide. */
function buildMergedCommandComments(
  lot: Lot,
  cmdComments: Record<string, string>,
  storeCommentSeparator: string,
): string {
  const lines: string[] = [];
  for (const inc of lot.commande_fournisseur_lot_inclusion ?? []) {
    const cf = inc.commande_fournisseur;
    if (!cf) {
      continue;
    }
    const txt = (cmdComments[cf.id] ?? "").trim();
    if (!txt) {
      continue;
    }
    lines.push(`${magLabel(cf.magasins)}${storeCommentSeparator}${txt}`);
  }
  return lines.join("\n");
}

export default function ValidationLotDetailClient({ lotId }: { lotId: string }) {
  const router = useRouter();
  const tLotDetail = useTranslations("backoffice.commandes.validation.lotDetail");
  const tCommandesCommon = useTranslations("backoffice.commandes.common");
  const tCommandesErrors = useTranslations("backoffice.commandes.errors");
  const tStatus = useTranslations("backoffice.status");
  const tCommon = useTranslations("common");
  const { formatDate, formatNumber, locale } = useAppFormat();
  const BackChevronIcon = useBackChevronIcon();
  const genericError = tCommandesErrors("generic");
  const { labelFor } = useStatusLabels();
  const { loading, can } = useSessionPermissions();
  const [lot, setLot] = useState<Lot | null>(null);
  const [lignes, setLignes] = useState<LotLigne[]>([]);
  const [vendeurs, setVendeurs] = useState<VendeurRef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowSaving, setRowSaving] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [condDialogOpen, setCondDialogOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ProductPickRow | null>(null);
  const [cancelLotDialogOpen, setCancelLotDialogOpen] = useState(false);
  const [reopenBrouillonDialogOpen, setReopenBrouillonDialogOpen] = useState(false);
  const [mergeLotDialogOpen, setMergeLotDialogOpen] = useState(false);
  const [pendingMergeBlock, setPendingMergeBlock] = useState<string>("");
  const [deleteLigneDialogOpen, setDeleteLigneDialogOpen] = useState(false);
  const [pendingDeleteLigne, setPendingDeleteLigne] = useState<{
    id: string;
    productLabel: string;
  } | null>(null);
  const [lotCommentDraft, setLotCommentDraft] = useState("");
  const [matrixGroupBy, setMatrixGroupBy] = useState<MatrixGroupBy>("category");
  const [cmdComments, setCmdComments] = useState<Record<string, string>>({});
  const [lotCommentSaving, setLotCommentSaving] = useState(false);
  const [cmdCommentSavingId, setCmdCommentSavingId] = useState<string | null>(null);
  const [vendeurWhatsAppSent, setVendeurWhatsAppSent] = useState<Record<string, boolean>>({});
  /** Quantité par cellule au focus : enregistrement seulement si la valeur a changé au blur. */
  const cellFocusBaseline = useRef<Record<string, number>>({});

  const loadRef = useRef<(() => Promise<void>) | null>(null);

  const {
    drafts: vendeurCommentDrafts,
    applyServerDrafts: applyVendeurCommentDrafts,
    onDraftChange: onVendeurCommentDraftChange,
    onDraftBlur: onVendeurCommentBlur,
  } = useVendeurCommentPersistence({
    lotId,
    lotStatus: lot?.status,
    genericError,
    onError: (message) => setErr(message),
    onReload: () => loadRef.current?.() ?? Promise.resolve(),
  });

  const load = useCallback(async () => {
    setErr(null);
    setDataLoading(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
        credentials: "include",
      });
      const j = (await res.json()) as {
        lot?: Lot;
        lignes?: LotLigne[];
        vendeurs?: VendeurRef[];
        vendeurCommentaires?: Record<string, string | null>;
        vendeurWhatsAppSent?: Record<string, boolean>;
        error?: string;
      };
      if (!res.ok) {
        setErr(j.error ?? genericError);
        setLot(null);
        return;
      }
      setLot(j.lot ?? null);
      setLignes(j.lignes ?? []);
      setVendeurs(j.vendeurs ?? []);
      const vc: Record<string, string> = {};
      for (const [key, value] of Object.entries(j.vendeurCommentaires ?? {})) {
        vc[key] = typeof value === "string" ? value : "";
      }
      applyVendeurCommentDrafts(vc);
      setVendeurWhatsAppSent(j.vendeurWhatsAppSent ?? {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : genericError);
    } finally {
      setDataLoading(false);
    }
  }, [lotId, genericError, applyVendeurCommentDrafts]);

  loadRef.current = load;

  useEffect(() => {
    if (!loading && !can("commandes_fournisseur.consolidation")) {
      void router.replace("/access-refuse");
    }
  }, [loading, can, router]);

  useEffect(() => {
    if (!loading && can("commandes_fournisseur.consolidation")) {
      void load();
    }
  }, [loading, can, load]);

  useEffect(() => {
    if (!lot) {
      return;
    }
    setLotCommentDraft(lot.commentaire ?? "");
    const next: Record<string, string> = {};
    for (const inc of lot.commande_fournisseur_lot_inclusion ?? []) {
      const cf = inc.commande_fournisseur;
      if (!cf) {
        continue;
      }
      next[cf.id] = cf.commentaire ?? "";
    }
    setCmdComments(next);
  }, [lot]);

  const parcoursPending = pendingProduct ? parcoursShapeFromPickRow(pendingProduct) : null;
  const { panelProps: condPanelProps, packRoute } = useSingleProductParcoursQuantity(
    parcoursPending,
    condDialogOpen,
    lot?.supplier_id ?? null,
  );

  const magasinColumns = useMemo(() => magasinColumnsFromLot(lot), [lot]);

  const recapLignes = useMemo((): RecapLigneInput[] => {
    return lignes.map((l) => ({
      id: l.id,
      product_id: l.product_id,
      product_packaging_id: l.product_packaging_id,
      vendeur_id: l.vendeur_id ?? null,
      categoryLabel: l.categoryLabel,
      product: normalizeProduct(l.product),
      commande_fournisseur_lot_ligne_magasin: l.commande_fournisseur_lot_ligne_magasin,
      saisieLigneTargets: l.saisieLigneTargets,
    }));
  }, [lignes]);

  const commandeDate = useMemo(() => lotCommandeDateInfo(lot), [lot]);

  const matrixCategoryColSpan = useMemo(() => {
    const ed = lot?.status === "brouillon";
    return 1 + magasinColumns.length + 2 + (ed ? 1 : 0);
  }, [lot?.status, magasinColumns.length]);

  const patchMagasinQte = useCallback(
    async (lotLigneId: string, magasinId: string, qte: number) => {
      setRowSaving(lotLigneId);
      setErr(null);
      try {
        const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setMagasinQte: { lotLigneId, magasinId, qte } }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? genericError);
          await load();
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : genericError);
        await load();
      } finally {
        setRowSaving(null);
      }
    },
    [lotId, load, genericError],
  );

  const updateLocalQte = useCallback(
    (lotLigneId: string, magasinId: string, qte: number) => {
      const magasinsMeta = magasinsForMagasinId(lot, magasinId);
      setLignes((prev) =>
        prev.map((l) => {
          if (l.id !== lotLigneId) {
            return l;
          }
          const mags = [...(l.commande_fournisseur_lot_ligne_magasin ?? [])];
          const ix = mags.findIndex((x) => x.magasin_id === magasinId);
          if (ix >= 0) {
            mags[ix] = {
              ...mags[ix]!,
              qte,
              magasins: mags[ix]!.magasins ?? magasinsMeta,
            };
          } else if (qte > 0) {
            mags.push({ magasin_id: magasinId, qte, magasins: magasinsMeta });
          }
          const tot = mags.reduce((s, m) => s + (Number(m.qte) || 0), 0);
          return { ...l, commande_fournisseur_lot_ligne_magasin: mags, qte_achat: tot };
        }),
      );
    },
    [lot],
  );

  const executeCancelLot = useCallback(async () => {
    if (!lot || lot.status !== "brouillon") {
      setCancelLotDialogOpen(false);
      return;
    }
    setCancelLotDialogOpen(false);
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? genericError);
        return;
      }
      void router.push("/commandes-fournisseur/validation");
    } catch (e) {
      setErr(e instanceof Error ? e.message : genericError);
    } finally {
      setSaving(false);
    }
  }, [lot, lotId, router, genericError]);

  const executeReopenBrouillon = useCallback(async () => {
    if (!lot || lot.status !== "prete") {
      setReopenBrouillonDialogOpen(false);
      return;
    }
    setReopenBrouillonDialogOpen(false);
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "brouillon" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? genericError);
        return;
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : genericError);
    } finally {
      setSaving(false);
    }
  }, [lot, lotId, load, router, genericError]);

  const onPrete = async () => {
    if (!lot || lot.status !== "brouillon") {
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "prete" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? genericError);
        return;
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : genericError);
    } finally {
      setSaving(false);
    }
  };

  const postLotProduct = useCallback(
    async (productId: string, productPackagingId: string | null) => {
      if (!lot || lot.status !== "brouillon") {
        return;
      }
      setErr(null);
      setSaving(true);
      try {
        const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}/produits`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            productPackagingId,
          }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? genericError);
          return;
        }
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : genericError);
      } finally {
        setSaving(false);
      }
    },
    [lot, lotId, load, genericError],
  );

  const handleProductChosenFromPicker = useCallback(
    (picked: ProductPickRow) => {
      if (!lot || lot.status !== "brouillon") {
        return;
      }
      const packs = packArray(parcoursShapeFromPickRow(picked).product_packaging);
      if (packs.length > 0) {
        setPendingProduct(picked);
        setCondDialogOpen(true);
        return;
      }
      void postLotProduct(picked.id, null);
    },
    [lot, postLotProduct],
  );

  const handleCondLotDialogConfirm = useCallback(() => {
    const p = pendingProduct;
    if (!p) {
      return;
    }
    const packagingId = packRoute === "unit" ? null : packRoute;
    setCondDialogOpen(false);
    setPendingProduct(null);
    void postLotProduct(p.id, packagingId);
  }, [pendingProduct, packRoute, postLotProduct]);

  const handleCondLotDialogClose = useCallback(() => {
    setCondDialogOpen(false);
    setPendingProduct(null);
  }, []);

  const openDeleteLigneDialog = useCallback((lineId: string, label: string) => {
    if (!lot || lot.status !== "brouillon") {
      return;
    }
    setPendingDeleteLigne({ id: lineId, productLabel: label });
    setDeleteLigneDialogOpen(true);
  }, [lot]);

  const closeDeleteLigneDialog = useCallback(() => {
    setDeleteLigneDialogOpen(false);
    setPendingDeleteLigne(null);
  }, []);

  const executeDeleteLigne = useCallback(async () => {
    const pending = pendingDeleteLigne;
    if (!pending || !lot || lot.status !== "brouillon") {
      return;
    }
    const lineId = pending.id;
    setRowSaving(lineId);
    setErr(null);
    try {
      const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeLotLigneId: lineId }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? genericError);
        return;
      }
      closeDeleteLigneDialog();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : genericError);
    } finally {
      setRowSaving(null);
    }
  }, [closeDeleteLigneDialog, load, lot, lotId, pendingDeleteLigne, genericError]);

  const patchLotCommentaire = useCallback(
    async (nextRaw: string) => {
      const lotCur = lot;
      if (!lotCur || lotCur.status !== "brouillon") {
        return;
      }
      const stored = nextRaw.trim() === "" ? null : nextRaw.trim();
      const prevTrim = lotCur.commentaire?.trim() ?? "";
      if ((stored ?? "") === prevTrim) {
        return;
      }
      setLotCommentSaving(true);
      setErr(null);
      try {
        const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lotCommentaire: stored }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? genericError);
          await load();
          return;
        }
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : genericError);
        await load();
      } finally {
        setLotCommentSaving(false);
      }
    },
    [lot, lotId, load, genericError],
  );

  const markVendeurWhatsAppSent = useCallback(
    async (vendeurKey: string) => {
      let alreadySent = false;
      setVendeurWhatsAppSent((prev) => {
        if (prev[vendeurKey]) {
          alreadySent = true;
          return prev;
        }
        return { ...prev, [vendeurKey]: true };
      });
      if (alreadySent) {
        return;
      }

      try {
        const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ whatsappSent: { vendeurKey } }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setVendeurWhatsAppSent((prev) => {
            if (!prev[vendeurKey]) {
              return prev;
            }
            const next = { ...prev };
            delete next[vendeurKey];
            return next;
          });
          setErr(j.error ?? genericError);
        }
      } catch (e) {
        setVendeurWhatsAppSent((prev) => {
          if (!prev[vendeurKey]) {
            return prev;
          }
          const next = { ...prev };
          delete next[vendeurKey];
          return next;
        });
        setErr(e instanceof Error ? e.message : genericError);
      }
    },
    [genericError, lotId],
  );

  const patchCommandeCommentaire = useCallback(
    async (commandeId: string, nextRaw: string) => {
      const lotCur = lot;
      if (!lotCur || lotCur.status !== "brouillon") {
        return;
      }
      const stored = nextRaw.trim() === "" ? null : nextRaw.trim();
      let prevTrim = "";
      for (const inc of lotCur.commande_fournisseur_lot_inclusion ?? []) {
        const cf = inc.commande_fournisseur;
        if (cf?.id === commandeId) {
          prevTrim = cf.commentaire?.trim() ?? "";
          break;
        }
      }
      if ((stored ?? "") === prevTrim) {
        return;
      }
      setCmdCommentSavingId(commandeId);
      setErr(null);
      try {
        const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentaire: stored }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? genericError);
          await load();
          return;
        }
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : genericError);
        await load();
      } finally {
        setCmdCommentSavingId(null);
      }
    },
    [lot, load, genericError],
  );

  const handlePreremplirLotDepuisCommandes = useCallback(() => {
    const lotCur = lot;
    if (!lotCur || lotCur.status !== "brouillon") {
      return;
    }
    const block = buildMergedCommandComments(
      lotCur,
      cmdComments,
      tCommandesCommon("storeCommentSeparator"),
    );
    if (!block.trim()) {
      setErr(tCommandesErrors("noOrderCommentsToMerge"));
      return;
    }
    setErr(null);
    const cur = lotCommentDraft.trim();
    if (!cur) {
      setLotCommentDraft(block);
      void patchLotCommentaire(block);
      return;
    }
    setPendingMergeBlock(block);
    setMergeLotDialogOpen(true);
  }, [
    lot,
    cmdComments,
    lotCommentDraft,
    patchLotCommentaire,
    tCommandesCommon,
    tCommandesErrors,
  ]);

  const applyMergeLotComment = useCallback(
    (mode: "append" | "replace") => {
      const block = pendingMergeBlock;
      if (!block.trim()) {
        return;
      }
      const next =
        mode === "replace"
          ? block
          : `${lotCommentDraft.trim()}\n\n${block}`;
      setMergeLotDialogOpen(false);
      setPendingMergeBlock("");
      setLotCommentDraft(next);
      void patchLotCommentaire(next);
    },
    [pendingMergeBlock, lotCommentDraft, patchLotCommentaire],
  );

  if (loading) {
    return <p className="px-4 py-6">{tCommandesCommon("loading")}</p>;
  }
  if (!can("commandes_fournisseur.consolidation")) {
    return null;
  }

  if (err && !lot) {
    return (
      <main className="px-4 py-6">
        <Typography color="error">{err}</Typography>
        <Button component={AppLink} href="/commandes-fournisseur/validation" className="!mt-4" sx={{ textTransform: "none" }}>
          {tCommandesCommon("back")}
        </Button>
      </main>
    );
  }
  if (!lot) {
    return null;
  }

  const rSup = one(lot.ref_supplier as { label?: string } | { label?: string }[]);
  const supplierName = rSup && "label" in rSup && rSup.label ? String(rSup.label) : tCommandesCommon("emDash");
  const editable = lot.status === "brouillon";
  const vendeurCommentEditable = lot.status === "brouillon" || lot.status === "prete";
  const matrixGroupByEffective: MatrixGroupBy = lot.status === "prete" ? "category" : matrixGroupBy;
  const matrixDisplayItems = buildMatrixDisplayItems(
    recapLignes,
    matrixGroupByEffective,
    vendeurs,
    supplierName,
    tCommandesCommon("noCategory"),
  );
  const readyAtText = lot.marque_prete_at
    ? tLotDetail("readyAtSuffix", {
        date: formatDate(lot.marque_prete_at, { dateStyle: "short", timeStyle: "short" }),
      })
    : "";

  return (
    <main className="mx-auto w-full max-w-5xl overflow-x-auto px-4 py-6">
      <Button
        component={AppLink}
        href="/commandes-fournisseur/validation"
        color="inherit"
        size="small"
        startIcon={<BackChevronIcon fontSize="small" />}
        sx={{
          textTransform: "none",
          mb: 1,
          alignSelf: "flex-start",
          pl: 0,
          minHeight: 36,
          fontWeight: 500,
        }}
      >
        {tLotDetail("backToList")}
      </Button>
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }} component="h1">
        {tLotDetail("title", { supplier: supplierName })}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-4">
        <strong>{tLotDetail("statusLine", { statusLabel: labelFor("commande_fournisseur_lot", lot.status) })}</strong>
        {readyAtText}
      </Typography>

      {lot.status === "prete" ? (
        <div className="!mb-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outlined"
              color="warning"
              disabled={saving}
              onClick={() => setReopenBrouillonDialogOpen(true)}
              sx={{ textTransform: "none" }}
            >
              {tLotDetail("reopenDraft")}
            </Button>
          </div>
          {lignes.length > 0 ? (
            <LotConsolidationExportPanel
              lignes={recapLignes}
              vendeurs={vendeurs}
              magasinColumns={magasinColumns.map((m) => ({ id: m.id, mxCode: m.mxCode }))}
              supplierLabel={supplierName}
              commandeDateLabel={commandeDate.label}
              commandeDateSlug={commandeDate.slug}
              lotComment={lotCommentDraft}
              noCategoryLabel={tCommandesCommon("noCategory")}
              productCountLabel={tStatus("productCount", { count: recapLignes.length })}
            />
          ) : null}
        </div>
      ) : null}

      {err ? (
        <Typography color="error" className="!mb-2" variant="body2">
          {err}
        </Typography>
      ) : null}

      {dataLoading ? (
        <Typography color="text.secondary" className="!mb-4">
          {tLotDetail("loadingDetail")}
        </Typography>
      ) : null}

      {editable ? (
        <div className="!mb-2 flex justify-end">
          <Button
            type="button"
            variant="outlined"
            size="small"
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            {tCommandesCommon("addProduct")}
          </Button>
        </div>
      ) : null}
      {lignes.length === 0 ? (
        <Typography color="text.secondary" variant="body2" className="!mb-4">
          {tLotDetail("emptyLines")}
        </Typography>
      ) : (
        <div className="!mb-6 overflow-x-auto">
          {lot.status === "brouillon" ? (
            <div className="!mb-2 flex flex-wrap items-center justify-between gap-2">
              <ToggleButtonGroup
                size="small"
                exclusive
                value={matrixGroupBy}
                onChange={(_e, value: MatrixGroupBy | null) => {
                  if (value) {
                    setMatrixGroupBy(value);
                  }
                }}
                aria-label={tLotDetail("matrixGroupByAria")}
              >
                <ToggleButton value="category" sx={{ textTransform: "none" }}>
                  {tLotDetail("matrixGroupByCategory")}
                </ToggleButton>
                <ToggleButton value="vendeur" sx={{ textTransform: "none" }}>
                  {tLotDetail("matrixGroupByVendor")}
                </ToggleButton>
              </ToggleButtonGroup>
            </div>
          ) : null}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 200 }}>{tCommandesCommon("product")}</TableCell>
                {magasinColumns.map((m) => (
                  <TableCell key={m.id} align="right" sx={{ minWidth: 88, whiteSpace: "nowrap" }}>
                    {m.mxCode}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 600, minWidth: 56 }}>
                  {tLotDetail("tableTotal")}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, minWidth: 148 }}>
                  {tCommandesCommon("udvCond")}
                </TableCell>
                {editable ? (
                  <TableCell align="center" width={48} padding="checkbox">
                    {""}
                  </TableCell>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {matrixDisplayItems.map((item, itemIdx) => {
                if (item.type === "header") {
                  if (item.header.kind === "category") {
                    return (
                      <TableRow key={`cat-${item.header.label}-${itemIdx}`}>
                        <TableCell colSpan={matrixCategoryColSpan} sx={LOT_CATEGORY_HEADER_BG_SX}>
                          <Typography
                            variant="subtitle1"
                            color="success"
                            component="div"
                            sx={LOT_CATEGORY_HEADER_TEXT_SX}
                          >
                            {item.header.label}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const vendeurKey = item.header.vendeurKey;
                  return (
                    <TableRow key={`vendeur-${vendeurKey}-${itemIdx}`}>
                      <TableCell colSpan={matrixCategoryColSpan} sx={LOT_CATEGORY_HEADER_BG_SX}>
                        <Typography
                          variant="subtitle1"
                          color="success"
                          component="div"
                          sx={LOT_CATEGORY_HEADER_TEXT_SX}
                        >
                          {item.header.label}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                }

                if (item.type === "vendeurComment") {
                  const vendeurKey = item.vendeurKey;
                  return (
                    <TableRow key={`vendeur-comment-${vendeurKey}-${itemIdx}`}>
                      <TableCell colSpan={matrixCategoryColSpan} sx={{ py: 0.75, px: 1.25 }}>
                        {vendeurCommentEditable ? (
                          <TextField
                            fullWidth
                            multiline
                            minRows={2}
                            maxRows={6}
                            size="small"
                            label={tLotDetail("vendorCommentLabel")}
                            placeholder={tLotDetail("vendorCommentPlaceholder")}
                            value={vendeurCommentDrafts[vendeurKey] ?? ""}
                            onChange={(e) => onVendeurCommentDraftChange(vendeurKey, e.target.value)}
                            onBlur={(e) => onVendeurCommentBlur(vendeurKey, e.target.value)}
                          />
                        ) : vendeurCommentDrafts[vendeurKey]?.trim() ? (
                          <Typography variant="body2" className="whitespace-pre-wrap">
                            {vendeurCommentDrafts[vendeurKey]?.trim()}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                            {tCommandesCommon("noComment")}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }

                const l = lignes[item.index];
                if (!l) {
                  return null;
                }
                const p = normalizeProduct(l.product);
                const display = buildLotProductDisplayInfo(
                  p
                    ? {
                        ref_sales_unit: p.ref_sales_unit,
                        product_packaging: p.product_packaging,
                      }
                    : null,
                  l.product_packaging_id ?? null,
                );
                const mags = magasinColumns.map((col) => {
                  const c = l.commande_fournisseur_lot_ligne_magasin?.find((x) => x.magasin_id === col.id);
                  return c?.qte ?? 0;
                });
                const tot = mags.reduce((s, n) => s + n, 0);
                const soitLine = buildSoitLine(display, tot);
                const unitLabel = lotLigneQtyUnitLabel(l, p, locale);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Typography variant="body2" className="!font-medium">
                        {productName(p)}
                      </Typography>
                    </TableCell>
                    {magasinColumns.map((col, i) => {
                      const v = mags[i] ?? 0;
                      const cellKey = `${l.id}::${col.id}`;
                      const soitMag = v > 0 ? buildSoitLine(display, v) : null;
                      const qtyBlock = (
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            minWidth: 88,
                          }}
                        >
                          {editable ? (
                            <DecimalQtyTextField
                              value={v}
                              size="small"
                              disabled={rowSaving === l.id}
                              onQtyChange={(n) => updateLocalQte(l.id, col.id, n)}
                              onFocus={() => {
                                cellFocusBaseline.current[cellKey] = v;
                              }}
                              onBlur={() => {
                                const before = cellFocusBaseline.current[cellKey] ?? 0;
                                const after = mags[i] ?? 0;
                                if (roundQty2(before) !== roundQty2(after)) {
                                  void patchMagasinQte(l.id, col.id, after);
                                }
                              }}
                              sx={{ width: 88, "& .MuiInputBase-input": { textAlign: "right", py: 0.65 } }}
                              slotProps={{
                                htmlInput: {
                                  "aria-label": tCommandesCommon("quantityForStoreAria", {
                                    storeLabel: col.storeLabel,
                                  }),
                                },
                              }}
                            />
                          ) : (
                            <Typography variant="body2" component="span">
                              {formatNumber(v, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </Typography>
                          )}
                          {soitMag ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              component="div"
                              className="tabular-nums"
                              sx={{
                                mt: 0.35,
                                fontSize: "0.6875rem",
                                lineHeight: 1.25,
                                textAlign: "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {soitMag}
                            </Typography>
                          ) : null}
                        </Box>
                      );
                      const cellTargets = targetsForMagasinCell(l, col.id, col.storeLabel);

                      return (
                        <TableCell key={col.id} align="right">
                          <LigneCommentaireSaisieControls
                            lotId={lotId}
                            layout="inline"
                            productLabel={productName(p)}
                            productId={l.product_id}
                            productPackagingId={l.product_packaging_id}
                            targets={cellTargets}
                            editable={editable}
                            disabled={saving || rowSaving === l.id}
                            onUpdated={load}
                            leading={qtyBlock}
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell align="right" sx={{ verticalAlign: "middle" }}>
                      <Typography variant="body2" component="span" sx={{ fontWeight: 700 }}>
                        {formatNumber(tot, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align="left"
                      sx={{
                        verticalAlign: "middle",
                        textAlign: "left",
                      }}
                    >
                      {unitLabel !== "—" ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", lineHeight: 1.35, textAlign: "left" }}
                        >
                          {unitLabel}
                        </Typography>
                      ) : null}
                      {soitLine ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            mt: unitLabel !== "—" ? 0.35 : 0,
                            display: "block",
                            lineHeight: 1.25,
                            textAlign: "left",
                          }}
                        >
                          {soitLine}
                        </Typography>
                      ) : null}
                    </TableCell>
                    {editable ? (
                      <TableCell align="center" padding="checkbox">
                        <IconButton
                          type="button"
                          size="small"
                          color="error"
                          aria-label={tCommandesCommon("removeLineAria")}
                          disabled={saving || rowSaving === l.id}
                          onClick={() => openDeleteLigneDialog(l.id, productName(p))}
                        >
                          <DeleteOutlineOutlinedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {lot.status === "prete" && lignes.length > 0 ? (
        <ValidationLotVendeurRecap
          lot={lot}
          supplierLabel={supplierName}
          commandeDateLabel={commandeDate.label}
          commandeDateSlug={commandeDate.slug}
          lignes={recapLignes}
          vendeurs={vendeurs}
          vendeurCommentDrafts={vendeurCommentDrafts}
          vendeurCommentEditable={vendeurCommentEditable}
          onVendeurCommentDraftChange={onVendeurCommentDraftChange}
          onVendeurCommentSave={onVendeurCommentBlur}
          vendeurWhatsAppSent={vendeurWhatsAppSent}
          onVendeurWhatsAppSent={markVendeurWhatsAppSent}
        />
      ) : null}

      {lot.status === "brouillon" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant="outlined"
            color="warning"
            disabled={saving}
            onClick={() => setCancelLotDialogOpen(true)}
            sx={{ textTransform: "none" }}
          >
            {tLotDetail("cancelLot")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            disabled={saving}
            onClick={() => void onPrete()}
            sx={{ textTransform: "none" }}
          >
            {saving ? tCommandesCommon("loadingEllipsis") : tLotDetail("markReadyForPurchase")}
          </Button>
        </div>
      ) : null}

      <div className="!mt-10 border-t border-slate-200 pt-6">
        <Typography variant="subtitle2" className="!mb-1" sx={{ fontWeight: 600 }}>
          {tLotDetail("lotCommentSection")}
        </Typography>
        {editable ? (
          <TextField
            fullWidth
            multiline
            minRows={4}
            maxRows={16}
            className="!mb-2"
            placeholder={tLotDetail("lotCommentPlaceholder")}
            value={lotCommentDraft}
            onChange={(e) => setLotCommentDraft(e.target.value)}
            disabled={lotCommentSaving}
            onBlur={() => {
              if (!lotCommentSaving) {
                void patchLotCommentaire(lotCommentDraft);
              }
            }}
          />
        ) : (
          <div className="!mb-2 rounded-md border border-slate-200/80 bg-slate-50/50 p-3">
            {lotCommentDraft.trim() ? (
              <Typography variant="body2" className="whitespace-pre-wrap text-slate-800">
                {lotCommentDraft.trim()}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                {tCommandesCommon("noComment")}
              </Typography>
            )}
          </div>
        )}
        {editable ? (
          <div className="!mb-4">
            <Button
              type="button"
              variant="outlined"
              size="small"
              disabled={
                lotCommentSaving || dataLoading || cmdCommentSavingId != null || saving
              }
              onClick={() => handlePreremplirLotDepuisCommandes()}
              sx={{ textTransform: "none" }}
            >
              {tLotDetail("prefillFromOrders")}
            </Button>
          </div>
        ) : null}

        <Typography variant="subtitle2" className="!mb-1" sx={{ fontWeight: 600 }}>
          {tLotDetail("includedOrdersSection")}
        </Typography>
        <div className="flex flex-col gap-3">
          {(lot.commande_fournisseur_lot_inclusion ?? []).map((inc) => {
            const cf = inc.commande_fournisseur;
            if (!cf) {
              return null;
            }
            const cmdText = cmdComments[cf.id] ?? "";
            return (
              <div key={cf.id} className="rounded border border-slate-200/80 bg-slate-50/50 p-3">
                <Typography variant="body2" className="!mb-1 !font-medium">
                  {magLabel(cf.magasins)}{" "}
                  <span className="font-normal text-slate-500">
                    {tLotDetail("orderStatusInline", {
                      statusLabel: labelFor("commande_fournisseur", cf.status),
                    })}
                  </span>
                </Typography>
                {editable ? (
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={8}
                    size="small"
                    placeholder={tLotDetail("orderCommentPlaceholder")}
                    value={cmdText}
                    onChange={(e) =>
                      setCmdComments((prev) => ({ ...prev, [cf.id]: e.target.value }))
                    }
                    disabled={cmdCommentSavingId === cf.id || dataLoading || lotCommentSaving}
                    onBlur={(e) => {
                      void patchCommandeCommentaire(cf.id, e.target.value);
                    }}
                  />
                ) : cmdText.trim() ? (
                  <Typography variant="body2" className="whitespace-pre-wrap text-slate-800">
                    {cmdText.trim()}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                    {tCommandesCommon("noComment")}
                  </Typography>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={mergeLotDialogOpen}
        onClose={() => {
          setMergeLotDialogOpen(false);
          setPendingMergeBlock("");
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 0.5 }}>{tLotDetail("mergeDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" className="!mb-2">
            {tLotDetail("mergeDialog.body")}
          </Typography>
          <Typography
            variant="body2"
            component="pre"
            className="max-h-40 overflow-auto rounded bg-slate-100 p-2 text-slate-800"
            sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.875rem", m: 0 }}
          >
            {pendingMergeBlock}
          </Typography>
        </DialogContent>
        <DialogActions className="!flex-wrap !justify-end !gap-2 !px-3 !pb-2">
          <Button
            type="button"
            color="inherit"
            onClick={() => {
              setMergeLotDialogOpen(false);
              setPendingMergeBlock("");
            }}
            sx={{ textTransform: "none" }}
            disabled={lotCommentSaving}
          >
            {tCommandesCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant="outlined"
            onClick={() => applyMergeLotComment("append")}
            sx={{ textTransform: "none" }}
            disabled={lotCommentSaving}
          >
            {tLotDetail("mergeDialog.append")}
          </Button>
          <Button
            type="button"
            variant="contained"
            onClick={() => applyMergeLotComment("replace")}
            sx={{ textTransform: "none" }}
            disabled={lotCommentSaving}
          >
            {tLotDetail("mergeDialog.replace")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reopenBrouillonDialogOpen} onClose={() => setReopenBrouillonDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>{tLotDetail("reopenDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {tLotDetail("reopenDialog.body", {
              statusLabel: labelFor("commande_fournisseur_lot", "brouillon"),
            })}
          </Typography>
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button
            type="button"
            color="inherit"
            onClick={() => setReopenBrouillonDialogOpen(false)}
            sx={{ textTransform: "none" }}
            disabled={saving}
          >
            {tLotDetail("reopenDialog.back")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="warning"
            disabled={saving}
            onClick={() => void executeReopenBrouillon()}
            sx={{ textTransform: "none" }}
          >
            {saving ? tCommandesCommon("loadingEllipsis") : tLotDetail("reopenDialog.confirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteLigneDialogOpen}
        onClose={closeDeleteLigneDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 0.5 }}>{tLotDetail("deleteLineDialog.title")}</DialogTitle>
        <DialogContent>
          {pendingDeleteLigne ? (
            <Typography variant="body2" color="text.secondary">
              {tLotDetail("deleteLineDialog.body", { productLabel: pendingDeleteLigne.productLabel })}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button
            type="button"
            color="inherit"
            onClick={closeDeleteLigneDialog}
            sx={{ textTransform: "none" }}
            disabled={saving || rowSaving != null}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="error"
            disabled={saving || rowSaving != null}
            onClick={() => void executeDeleteLigne()}
            sx={{ textTransform: "none" }}
          >
            {rowSaving != null ? tCommandesCommon("loadingEllipsis") : tCommon("delete")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelLotDialogOpen} onClose={() => setCancelLotDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>{tLotDetail("cancelLotDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {tLotDetail("cancelLotDialog.body", {
              statusLabel: labelFor("commande_fournisseur", "validee"),
            })}
          </Typography>
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button
            type="button"
            color="inherit"
            onClick={() => setCancelLotDialogOpen(false)}
            sx={{ textTransform: "none" }}
            disabled={saving}
          >
            {tLotDetail("cancelLotDialog.back")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="warning"
            disabled={saving}
            onClick={() => void executeCancelLot()}
            sx={{ textTransform: "none" }}
          >
            {saving ? tCommandesCommon("loadingEllipsis") : tLotDetail("cancelLotDialog.confirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <CommandeFournisseurProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        supplierId={lot.supplier_id}
        alreadyPresentLabel={tCommandesCommon("alreadyInLot")}
        onSelect={handleProductChosenFromPicker}
      />

      <FormDialog open={condDialogOpen} onClose={handleCondLotDialogClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>{tLotDetail("condDialog.title")}</DialogTitle>
        <DialogContent>
          {pendingProduct ? (
            <>
              <Typography variant="subtitle2" className="!mb-2 !font-semibold">
                {pendingProduct.name}
              </Typography>
              <ProductArabicSubtitle nameAr={pendingProduct.name_ar} matchNameLine />
              <Typography variant="body2" color="text.secondary" className="!mb-3">
                {tLotDetail("condDialog.hint")}
              </Typography>
              {condPanelProps ? (
                <ParcoursProductQuantityPanel {...condPanelProps} hideQuantityControls />
              ) : null}
            </>
          ) : null}
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button type="button" color="inherit" onClick={handleCondLotDialogClose} sx={{ textTransform: "none" }}>
            {tCommandesCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            disabled={saving}
            onClick={() => void handleCondLotDialogConfirm()}
            sx={{ textTransform: "none" }}
          >
            {tLotDetail("addToLot")}
          </Button>
        </DialogActions>
      </FormDialog>

    </main>
  );
}
