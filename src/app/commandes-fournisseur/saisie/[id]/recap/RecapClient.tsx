"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import AppLink from "@/components/AppLink";
import ProductArabicSubtitle from "@/components/ProductArabicSubtitle";
import CommandeFournisseurProductPicker, {
  type ProductPickRow,
} from "@/features/commandes-fournisseur/CommandeFournisseurProductPicker";
import {
  ParcoursProductQuantityPanel,
  packArray,
  parcoursShapeFromPickRow,
  useSingleProductParcoursQuantity,
} from "@/features/commandes-fournisseur/parcours-product-quantity";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { DecimalQtyTextField } from "@/components/commandes-fournisseur/DecimalQtyTextField";
import { buildSoitLine } from "@/lib/commandes-fournisseur/product-display";
import { clampQtyToApiRange, roundQty2 } from "@/lib/commandes-fournisseur/qty-parse";

type Ligne = {
  id: string;
  product_id: string;
  product_packaging_id: string | null;
  qte: number;
  line_comment: string | null;
  hors_fournisseur: boolean;
  product: { name: string; code: string; name_ar?: string | null } | null;
  /** Unité de vente du produit (réf. produit) : à l’unité et « Soit » pour conditionnements. */
  uniteVente?: string;
  condTitre?: string | null;
  /** Quantité contenu par conditionnement (product_packaging.quantity), pour le calcul Soit. */
  packContentQty?: number | null;
  /** UdV du conditionnement = « Unité » : pas de ligne « Soit … ». */
  packSalesUnitIsUnite?: boolean;
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

function supplierLabel(c: Commande): string {
  const r = c.ref_supplier;
  if (!r) return "—";
  const x = Array.isArray(r) ? r[0] : r;
  return (x as { label?: string })?.label ?? "—";
}

function formatSoit(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Largeur quantité + unité : plus étroit sur mobile pour ne pas pousser les boutons ± sur le libellé. */
const QTE_UNITE_W = "min-w-0 w-[6rem] sm:w-[9rem] shrink-0";

function StepQte({
  value,
  uniteVente,
  onChange,
  hideUnit,
}: {
  value: number;
  uniteVente: string;
  onChange: (n: number) => void;
  /** Conditionnement : pas d’unité de vente à droite de la quantité. */
  hideUnit?: boolean;
}) {
  const step =
    (d: number) => () =>
      onChange(Math.max(0, roundQty2(roundQty2(value) + d)));
  return (
    <div className="flex max-w-[100%] shrink-0 items-center gap-0.5 sm:gap-1">
      <Button
        size="small"
        variant="outlined"
        className="!min-w-[2.35rem] !px-1 sm:!min-w-[40px] sm:!px-2"
        sx={{ py: 0.5 }}
        onClick={() => step(-1)()}
        disabled={value < 1}
        aria-label={value < 1 ? "Quantité minimale, supprimez la ligne pour retirer" : "Diminuer de 1"}
      >
        -1
      </Button>
      <div className={`flex shrink-0 items-center gap-1 ${QTE_UNITE_W}`}>
        <DecimalQtyTextField
          size="small"
          value={clampQtyToApiRange(value)}
          onQtyChange={(n) => onChange(clampQtyToApiRange(n))}
          sx={{
            "& .MuiInputBase-input": { py: 0.65, textAlign: "center", px: 0.75 },
            minWidth: "3.75rem",
            maxWidth: "5.75rem",
          }}
          slotProps={{ htmlInput: { "aria-label": "Quantité produit" } }}
        />
        {hideUnit ? null : (
          <Typography
            variant="caption"
            color="text.secondary"
            className="min-w-0 max-w-[5rem] shrink truncate text-left"
            title={uniteVente}
          >
            {uniteVente}
          </Typography>
        )}
      </div>
      <Button
        size="small"
        variant="outlined"
        className="!min-w-[2.35rem] !px-1 sm:!min-w-[40px] sm:!px-2"
        sx={{ py: 0.5 }}
        onClick={() => step(1)()}
      >
        +1
      </Button>
    </div>
  );
}

export default function RecapClient({ commandeId }: { commandeId: string }) {
  const router = useRouter();
  const { labelFor } = useStatusLabels();
  const [commande, setCommande] = useState<Commande | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [condDialogOpen, setCondDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ProductPickRow | null>(null);

  const parcoursPending = pendingProduct ? parcoursShapeFromPickRow(pendingProduct) : null;
  const { snapshot: condSnapshot, panelProps: condPanelProps } = useSingleProductParcoursQuantity(
    parcoursPending,
    condDialogOpen,
    commande?.supplier_id ?? null,
  );

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, { credentials: "include" });
      const j = (await res.json()) as { commande?: Commande; lignes?: Ligne[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erreur");
        return;
      }
      if (j.commande) {
        setCommande(j.commande);
        setComment(j.commande.commentaire ?? "");
      }
      setLignes(j.lignes ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [commandeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = commande?.status === "en_saisie";

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
        throw new Error(j.error ?? "Sauvegarde lignes");
      }
    },
    [commandeId],
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
      throw new Error(j.error ?? "Commentaire");
    }
  }, [commandeId, comment]);

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
        throw new Error(j.error ?? "Validation");
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [commandeId, editable, load, persistLignes, router, saveComment]);

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
        throw new Error(j.error ?? "Annulation");
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [commandeId, load, router]);

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
        throw new Error(j.error ?? "Réouverture");
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [commandeId, load, router]);

  const setLigneQte = (i: number, q: number) => {
    setLignes((prev) => {
      const next = [...prev];
      const row = next[i];
      if (!row) return prev;
      next[i] = { ...row, qte: q };
      return next;
    });
  };

  const onDeleteLigne = useCallback(
    async (i: number) => {
      if (!editable) return;
      const row = lignes[i];
      if (!row) return;
      const name = row.product?.name?.trim() || row.product_id;
      if (
        !window.confirm(
          `Supprimer la ligne « ${name} » de cette commande ?\n\nCette action est définitive.`,
        )
      ) {
        return;
      }
      setErr(null);
      setSaving(true);
      try {
        const next = lignes.filter((_, j) => j !== i);
        await putLignes(next);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
      } finally {
        setSaving(false);
      }
    },
    [editable, lignes, load, putLignes],
  );

  const addLineFromProduct = useCallback(
    async (p: ProductPickRow, productPackagingId: string | null, qte: number) => {
      if (!editable || !commande) {
        return;
      }
      const newLine: Ligne = {
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
      };
      setErr(null);
      setSaving(true);
      try {
        await putLignes([...lignes, newLine]);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
      } finally {
        setSaving(false);
      }
    },
    [commande, editable, lignes, load, putLignes],
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
      void addLineFromProduct(p, null, 1);
    },
    [addLineFromProduct, commande, editable],
  );

  const handleCondDialogConfirm = useCallback(() => {
    if (!pendingProduct || !condSnapshot) {
      return;
    }
    void addLineFromProduct(
      pendingProduct,
      condSnapshot.product_packaging_id,
      condSnapshot.qte,
    );
    setCondDialogOpen(false);
    setPendingProduct(null);
  }, [addLineFromProduct, condSnapshot, pendingProduct]);

  const handleCondDialogClose = useCallback(() => {
    setCondDialogOpen(false);
    setPendingProduct(null);
  }, []);

  if (loading) {
    return <p className="px-4 py-4">Chargement…</p>;
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

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <Button
        component={AppLink}
        href="/commandes-fournisseur/saisie"
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
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }}>
        Récapitulatif
      </Typography>
      <div className="!mb-4 flex flex-col gap-1">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} component="p" className="!m-0">
          Fournisseur : {supplierLabel(commande)}
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

      {editable ? (
        <div className="!mb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <Button
            component={AppLink}
            href={`/commandes-fournisseur/saisie/${commandeId}/parcours`}
            variant="outlined"
            size="small"
            sx={{ textTransform: "none" }}
          >
            Parcours produits
          </Button>
          <Button
            type="button"
            variant="outlined"
            size="small"
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            Ajouter un produit
          </Button>
        </div>
      ) : null}
      <List dense disablePadding>
        {lignes.map((l, i) => {
          const u = l.uniteVente ?? "—";
          const isCond = Boolean(l.product_packaging_id);
          const pq = l.packContentQty;
          const soitCond = buildSoitLine(
            {
              uniteVente: u,
              condTitre: l.condTitre ?? null,
              packContentQty: isCond ? (pq ?? null) : null,
              isCond,
              packSalesUnitIsUnite: l.packSalesUnitIsUnite === true,
            },
            l.qte,
          );
          const catKey = (l.categoryLabel ?? "").trim() || "Sans catégorie";
          const prevCat =
            i > 0 ? ((lignes[i - 1]!.categoryLabel ?? "").trim() || "Sans catégorie") : null;
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
                  {l.condTitre ? (
                    <Typography variant="caption" color="text.secondary" className="!mt-0.5 block">
                      {l.condTitre}
                    </Typography>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  {editable ? (
                    <div className="flex items-start gap-0.5">
                      <div className="flex flex-col items-end gap-0.5">
                        <StepQte
                          value={l.qte}
                          uniteVente={u}
                          hideUnit={isCond}
                          onChange={(q) => setLigneQte(i, q)}
                        />
                        {soitCond ? (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            component="p"
                            className={`block text-center tabular-nums ${QTE_UNITE_W} self-center`}
                          >
                            {soitCond}
                          </Typography>
                        ) : null}
                      </div>
                      <IconButton
                        type="button"
                        size="small"
                        color="error"
                        aria-label="Supprimer la ligne"
                        onClick={() => void onDeleteLigne(i)}
                        disabled={saving}
                        className="!mt-0.5"
                      >
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end pr-0.5">
                      <div
                        className={`flex items-baseline justify-center gap-1 tabular-nums ${QTE_UNITE_W}`}
                      >
                        <Typography variant="body2" className="shrink-0 font-medium tabular-nums">
                          {formatSoit(l.qte)}
                        </Typography>
                        {isCond ? null : (
                          <Typography variant="body2" color="text.secondary" className="min-w-0 truncate">
                            {u}
                          </Typography>
                        )}
                      </div>
                      {soitCond ? (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          component="p"
                          className={`block text-center tabular-nums ${QTE_UNITE_W} self-center`}
                        >
                          {soitCond}
                        </Typography>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
              <Divider className="!my-2" />
            </ListItem>
            </Fragment>
          );
        })}
      </List>

      {lignes.length === 0 ? (
        <Typography variant="body2" color="text.secondary" className="!mb-4">
          {editable
            ? "Aucune ligne. Utilisez le parcours produits ou « Ajouter un produit »."
            : "Aucune ligne. Passez par le parcours produits."}
        </Typography>
      ) : null}

      <TextField
        fullWidth
        multiline
        minRows={2}
        label="Commentaire commande"
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
            {saving ? "…" : "Valider la commande"}
          </Button>
        ) : null}

        {commande.status === "validee" ? (
          <Button variant="outlined" color="warning" fullWidth onClick={() => void onRouvrir()} disabled={saving} sx={{ textTransform: "none" }}>
            {saving ? "…" : "Modifier (retour en saisie)"}
          </Button>
        ) : null}

        {commande.status === "integree" ? (
          <Typography variant="body2" color="text.secondary">
            Cette commande a été prise en compte par le gestionnaire. Modification impossible.
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
            Annuler la commande
          </Button>
        ) : null}

        {commande.status === "annulee" ? (
          <Typography variant="body2" color="text.secondary">
            Cette commande a été annulée. Aucune modification n&apos;est possible.
          </Typography>
        ) : null}
      </div>

      {commande ? (
        <CommandeFournisseurProductPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          supplierId={commande.supplier_id}
          magasinId={commande.magasin_id}
          existingProductIds={lignes.map((l) => l.product_id)}
          onSelect={handleProductPicked}
        />
      ) : null}

      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>Confirmer l&apos;annulation</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Cette action est définitive : la commande passera au statut «{" "}
            {labelFor("commande_fournisseur", "annulee")} » et ne pourra plus être modifiée.
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
            Retour
          </Button>
          <Button
            type="button"
            variant="contained"
            color="error"
            disabled={saving}
            onClick={() => void executeCancelOrder()}
            sx={{ textTransform: "none" }}
          >
            {saving ? "…" : "Confirmer l'annulation"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={condDialogOpen} onClose={handleCondDialogClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>Quantité et conditionnement</DialogTitle>
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
            Annuler
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            disabled={saving || !condSnapshot}
            onClick={handleCondDialogConfirm}
            sx={{ textTransform: "none" }}
          >
            Ajouter
          </Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
