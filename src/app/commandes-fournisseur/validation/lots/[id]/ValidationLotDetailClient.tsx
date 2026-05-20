"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ProductArabicSubtitle from "@/components/ProductArabicSubtitle";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { buildLotProductDisplayInfo, buildSoitLine } from "@/lib/commandes-fournisseur/product-display";
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
import type {
  CommentaireMagasinCell,
  SaisieLigneTarget,
} from "@/lib/commandes-fournisseur/ligne-saisie-comments";
import { roundQty2 } from "@/lib/commandes-fournisseur/qty-parse";

type ProductE = {
  id: string;
  name: string;
  code: string;
  ref_sales_unit?: unknown;
  product_packaging?: unknown;
} | null;

type MagE = { id: string; code: string; nom: string } | { id: string; code: string; nom: string }[] | null;

type LotLigne = {
  id: string;
  product_id: string;
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
};

function targetsForMagasinCell(
  l: LotLigne,
  magasinId: string,
  magasinLabel: string,
): SaisieLigneTarget[] {
  const cell = l.commentairesMagasin?.[magasinId];
  if (!cell) {
    return [];
  }
  return [
    {
      ligneId: cell.ligneId,
      commandeId: cell.commandeId,
      magasinId,
      magasinLabel,
      lineComment: cell.lineComment,
    },
  ];
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

function normalizeProduct(raw: ProductE | unknown): ProductE {
  if (raw == null) return null;
  return one(raw as ProductE | ProductE[]);
}

/** Texte multi-lignes « Magasin : commentaire » pour les commandes ayant un commentaire non vide. */
function buildMergedCommandComments(
  lot: Lot,
  cmdComments: Record<string, string>,
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
    lines.push(`${magLabel(cf.magasins)} : ${txt}`);
  }
  return lines.join("\n");
}

export default function ValidationLotDetailClient({ lotId }: { lotId: string }) {
  const router = useRouter();
  const { labelFor } = useStatusLabels();
  const { loading, can } = useSessionPermissions();
  const [lot, setLot] = useState<Lot | null>(null);
  const [lignes, setLignes] = useState<LotLigne[]>([]);
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
  const [lotCommentDraft, setLotCommentDraft] = useState("");
  const [cmdComments, setCmdComments] = useState<Record<string, string>>({});
  const [lotCommentSaving, setLotCommentSaving] = useState(false);
  const [cmdCommentSavingId, setCmdCommentSavingId] = useState<string | null>(null);
  /** Quantité par cellule au focus : enregistrement seulement si la valeur a changé au blur. */
  const cellFocusBaseline = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    setErr(null);
    setDataLoading(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { lot?: Lot; lignes?: LotLigne[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erreur");
        setLot(null);
        return;
      }
      setLot(j.lot ?? null);
      setLignes(j.lignes ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDataLoading(false);
    }
  }, [lotId]);

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

  const magasinColumns = useMemo(() => {
    const mags: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const l of lignes) {
      for (const c of l.commande_fournisseur_lot_ligne_magasin ?? []) {
        const id = c.magasin_id;
        if (seen.has(id)) continue;
        seen.add(id);
        mags.push({ id, label: magLabel(c.magasins) });
      }
    }
    mags.sort((a, b) => a.label.localeCompare(b.label, "fr"));
    return mags;
  }, [lignes]);

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
          setErr(j.error ?? "Erreur");
          await load();
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
        await load();
      } finally {
        setRowSaving(null);
      }
    },
    [lotId, load],
  );

  const updateLocalQte = useCallback(
    (lotLigneId: string, magasinId: string, qte: number) => {
      setLignes((prev) =>
        prev.map((l) => {
          if (l.id !== lotLigneId) {
            return l;
          }
          const mags = [...(l.commande_fournisseur_lot_ligne_magasin ?? [])];
          const ix = mags.findIndex((x) => x.magasin_id === magasinId);
          if (qte === 0) {
            if (ix >= 0) {
              mags.splice(ix, 1);
            }
          } else if (ix >= 0) {
            mags[ix] = { ...mags[ix]!, qte };
          } else {
            mags.push({ magasin_id: magasinId, qte, magasins: null });
          }
          const tot = mags.reduce((s, m) => s + (Number(m.qte) || 0), 0);
          return { ...l, commande_fournisseur_lot_ligne_magasin: mags, qte_achat: tot };
        }),
      );
    },
    [],
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
        setErr(j.error ?? "Erreur");
        return;
      }
      void router.push("/commandes-fournisseur/validation");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [lot, lotId, router]);

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
        setErr(j.error ?? "Erreur");
        return;
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [lot, lotId, load, router]);

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
        setErr(j.error ?? "Erreur");
        return;
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
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
          setErr(j.error ?? "Erreur");
          return;
        }
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
      } finally {
        setSaving(false);
      }
    },
    [lot, lotId, load],
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

  const onDeleteLigne = async (lineId: string) => {
    if (!lot || lot.status !== "brouillon") {
      return;
    }
    if (!window.confirm("Supprimer cette ligne produit du lot ?")) {
      return;
    }
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
        setErr(j.error ?? "Erreur");
        return;
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRowSaving(null);
    }
  };

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
          setErr(j.error ?? "Erreur");
          await load();
          return;
        }
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
        await load();
      } finally {
        setLotCommentSaving(false);
      }
    },
    [lot, lotId, load],
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
          setErr(j.error ?? "Erreur");
          await load();
          return;
        }
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
        await load();
      } finally {
        setCmdCommentSavingId(null);
      }
    },
    [lot, load],
  );

  const handlePreremplirLotDepuisCommandes = useCallback(() => {
    const lotCur = lot;
    if (!lotCur || lotCur.status !== "brouillon") {
      return;
    }
    const block = buildMergedCommandComments(lotCur, cmdComments);
    if (!block.trim()) {
      setErr("Aucun commentaire de commande à intégrer.");
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
  }, [lot, cmdComments, lotCommentDraft, patchLotCommentaire]);

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
    return <p className="px-4 py-6">Chargement…</p>;
  }
  if (!can("commandes_fournisseur.consolidation")) {
    return null;
  }

  if (err && !lot) {
    return (
      <main className="px-4 py-6">
        <Typography color="error">{err}</Typography>
        <Button component={AppLink} href="/commandes-fournisseur/validation" className="!mt-4" sx={{ textTransform: "none" }}>
          Retour
        </Button>
      </main>
    );
  }
  if (!lot) {
    return null;
  }

  const rSup = one(lot.ref_supplier as { label?: string } | { label?: string }[]);
  const supplierName = rSup && "label" in rSup && rSup.label ? String(rSup.label) : "—";
  const editable = lot.status === "brouillon";

  return (
    <main className="mx-auto w-full max-w-5xl overflow-x-auto px-4 py-6">
      <Button
        component={AppLink}
        href="/commandes-fournisseur/validation"
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
        Liste des commandes
      </Button>
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }} component="h1">
        Lot — {supplierName}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-4">
        Statut : <strong>{labelFor("commande_fournisseur_lot", lot.status)}</strong>
        {lot.marque_prete_at ? ` — prêt le ${new Date(lot.marque_prete_at).toLocaleString("fr-FR")}` : null}
      </Typography>

      {lot.status === "prete" ? (
        <div className="!mb-4">
          <Button
            type="button"
            variant="outlined"
            color="warning"
            disabled={saving}
            onClick={() => setReopenBrouillonDialogOpen(true)}
            sx={{ textTransform: "none" }}
          >
            Revenir en saisie
          </Button>
        </div>
      ) : null}

      {err ? (
        <Typography color="error" className="!mb-2" variant="body2">
          {err}
        </Typography>
      ) : null}

      {dataLoading ? (
        <Typography color="text.secondary" className="!mb-4">
          Chargement du détail…
        </Typography>
      ) : null}

      <div className="!mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Matrice besoins (par magasin)
        </Typography>
        {editable ? (
          <Button
            type="button"
            variant="outlined"
            size="small"
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            sx={{ textTransform: "none", alignSelf: "flex-start" }}
          >
            Ajouter un produit
          </Button>
        ) : null}
      </div>
      {lignes.length === 0 ? (
        <Typography color="text.secondary" variant="body2" className="!mb-4">
          Aucune ligne produit.
        </Typography>
      ) : (
        <div className="!mb-6 overflow-x-auto">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 200 }}>Produit</TableCell>
                {magasinColumns.map((m) => (
                  <TableCell key={m.id} align="right" sx={{ minWidth: 88, whiteSpace: "nowrap" }}>
                    {m.label}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 600, minWidth: 56 }}>
                  Total
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, minWidth: 148 }}>
                  Unité
                </TableCell>
                {editable ? (
                  <TableCell align="center" width={48} padding="checkbox">
                    {""}
                  </TableCell>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {lignes.map((l, i) => {
                const catKey = (l.categoryLabel ?? "").trim() || "Sans catégorie";
                const prevCat =
                  i > 0 ? ((lignes[i - 1]?.categoryLabel ?? "").trim() || "Sans catégorie") : null;
                const showCategoryHeader = i === 0 || catKey !== prevCat;
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
                return (
                  <Fragment key={l.id}>
                    {showCategoryHeader ? (
                      <TableRow>
                        <TableCell
                          colSpan={matrixCategoryColSpan}
                          sx={{
                            py: 0.85,
                            px: 1.25,
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
                            sx={{ fontWeight: 700, letterSpacing: "0.02em", width: "100%" }}
                          >
                            {catKey}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  <TableRow>
                    <TableCell>
                      <Typography variant="body2" className="!font-medium">
                        {productName(p)}
                      </Typography>
                    </TableCell>
                    {magasinColumns.map((col, i) => {
                      const v = mags[i] ?? 0;
                      const cellKey = `${l.id}::${col.id}`;
                      return (
                        <TableCell key={col.id} align="right">
                          <LigneCommentaireSaisieControls
                            lotId={lotId}
                            layout="inline"
                            productLabel={productName(p)}
                            targets={targetsForMagasinCell(l, col.id, col.label)}
                            editable={editable}
                            disabled={saving || rowSaving === l.id}
                            onUpdated={load}
                            leading={
                              editable ? (
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
                                  slotProps={{ htmlInput: { "aria-label": `Quantité ${col.label}` } }}
                                />
                              ) : (
                                <Typography variant="body2" component="span">
                                  {v.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}
                                </Typography>
                              )
                            }
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell align="right" sx={{ verticalAlign: "middle" }}>
                      <Typography variant="body2" component="span" sx={{ fontWeight: 700 }}>
                        {tot.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align="left"
                      sx={{
                        verticalAlign: "middle",
                        textAlign: "left",
                      }}
                    >
                      {display.condTitre ? (
                        <>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            component="span"
                            sx={{
                              display: "block",
                              whiteSpace: "nowrap",
                              lineHeight: 1.35,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "min(260px, 40vw)",
                            }}
                            title={display.condTitre}
                          >
                            {display.condTitre}
                          </Typography>
                          {soitLine ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5, display: "block", lineHeight: 1.35, textAlign: "left" }}
                            >
                              {soitLine}
                            </Typography>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {display.uniteVente && display.uniteVente !== "—" ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", lineHeight: 1.35, textAlign: "left" }}
                            >
                              {display.uniteVente}
                            </Typography>
                          ) : null}
                          {soitLine ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5, display: "block", lineHeight: 1.35, textAlign: "left" }}
                            >
                              {soitLine}
                            </Typography>
                          ) : null}
                        </>
                      )}
                    </TableCell>
                    {editable ? (
                      <TableCell align="center" padding="checkbox">
                        <IconButton
                          type="button"
                          size="small"
                          color="error"
                          aria-label="Supprimer la ligne"
                          disabled={saving || rowSaving === l.id}
                          onClick={() => void onDeleteLigne(l.id)}
                        >
                          <DeleteOutlineOutlinedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    ) : null}
                  </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

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
            Annuler le lot
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            disabled={saving}
            onClick={() => void onPrete()}
            sx={{ textTransform: "none" }}
          >
            {saving ? "…" : "Marquer prêt pour l’achat"}
          </Button>
        </div>
      ) : null}

      <div className="!mt-10 border-t border-slate-200 pt-6">
        <Typography variant="subtitle2" className="!mb-1" sx={{ fontWeight: 600 }}>
          Commentaire du lot
        </Typography>
        {editable ? (
          <TextField
            fullWidth
            multiline
            minRows={4}
            maxRows={16}
            className="!mb-2"
            placeholder="Commentaire général sur ce lot consolidé…"
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
                Aucun commentaire
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
              Préremplir depuis les commentaires
            </Button>
          </div>
        ) : null}

        <Typography variant="subtitle2" className="!mb-1" sx={{ fontWeight: 600 }}>
          Commandes incluses
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
                    ({labelFor("commande_fournisseur", cf.status)})
                  </span>
                </Typography>
                {editable ? (
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={8}
                    size="small"
                    placeholder="Commentaire pour cette commande…"
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
                    Aucun commentaire
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
        <DialogTitle sx={{ pb: 0.5 }}>Commentaire du lot déjà renseigné</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" className="!mb-2">
            Souhaitez-vous ajouter la synthèse des commentaires sous le texte actuel, ou remplacer le commentaire du
            lot ?
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
            Annuler
          </Button>
          <Button
            type="button"
            variant="outlined"
            onClick={() => applyMergeLotComment("append")}
            sx={{ textTransform: "none" }}
            disabled={lotCommentSaving}
          >
            Ajouter sous le texte
          </Button>
          <Button
            type="button"
            variant="contained"
            onClick={() => applyMergeLotComment("replace")}
            sx={{ textTransform: "none" }}
            disabled={lotCommentSaving}
          >
            Remplacer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reopenBrouillonDialogOpen} onClose={() => setReopenBrouillonDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>Revenir en Saisie</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Le lot repassera au statut « {labelFor("commande_fournisseur_lot", "brouillon")} » pour que vous puissiez
            ajuster la consolidation (matrice, commentaires, produits). Continuer ?
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
            Retour
          </Button>
          <Button
            type="button"
            variant="contained"
            color="warning"
            disabled={saving}
            onClick={() => void executeReopenBrouillon()}
            sx={{ textTransform: "none" }}
          >
            {saving ? "…" : "Confirmer : revenir en saisie"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelLotDialogOpen} onClose={() => setCancelLotDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>Confirmer l&apos;annulation du lot</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Les commandes incluses redeviennent « {labelFor("commande_fournisseur", "validee")} » hors lot. Le lot
            brouillon sera supprimé. Cette action ne peut pas être annulée ici.
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
            Retour
          </Button>
          <Button
            type="button"
            variant="contained"
            color="warning"
            disabled={saving}
            onClick={() => void executeCancelLot()}
            sx={{ textTransform: "none" }}
          >
            {saving ? "…" : "Confirmer l'annulation du lot"}
          </Button>
        </DialogActions>
      </Dialog>

      <CommandeFournisseurProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        supplierId={lot.supplier_id}
        existingProductIds={lignes.map((l) => l.product_id)}
        alreadyPresentLabel="Déjà dans le lot"
        onSelect={handleProductChosenFromPicker}
      />

      <Dialog open={condDialogOpen} onClose={handleCondLotDialogClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>Conditionnement</DialogTitle>
        <DialogContent>
          {pendingProduct ? (
            <>
              <Typography variant="subtitle2" className="!mb-2 !font-semibold">
                {pendingProduct.name}
              </Typography>
              <ProductArabicSubtitle nameAr={pendingProduct.name_ar} matchNameLine />
              <Typography variant="body2" color="text.secondary" className="!mb-3">
                Pré-sélection comme à la saisie magasin ; vous pouvez choisir à l’unité ou un autre conditionnement.
              </Typography>
              {condPanelProps ? (
                <ParcoursProductQuantityPanel {...condPanelProps} hideQuantityControls />
              ) : null}
            </>
          ) : null}
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button type="button" color="inherit" onClick={handleCondLotDialogClose} sx={{ textTransform: "none" }}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            disabled={saving}
            onClick={() => void handleCondLotDialogConfirm()}
            sx={{ textTransform: "none" }}
          >
            Ajouter au lot
          </Button>
        </DialogActions>
      </Dialog>

    </main>
  );
}
