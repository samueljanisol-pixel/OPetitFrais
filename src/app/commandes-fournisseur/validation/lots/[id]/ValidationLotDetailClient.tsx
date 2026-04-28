"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { buildLotProductDisplayInfo, buildSoitLine } from "@/lib/commandes-fournisseur/product-display";
import CommandeFournisseurProductPicker, {
  type ProductPickRow,
} from "@/features/commandes-fournisseur/CommandeFournisseurProductPicker";

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
  qte_achat: number | null;
  product: ProductE;
  commande_fournisseur_lot_ligne_magasin: {
    magasin_id: string;
    qte: number;
    magasins: MagE;
  }[];
};

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

export default function ValidationLotDetailClient({ lotId }: { lotId: string }) {
  const router = useRouter();
  const { loading, can } = useSessionPermissions();
  const [lot, setLot] = useState<Lot | null>(null);
  const [lignes, setLignes] = useState<LotLigne[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowSaving, setRowSaving] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  const handleProductPickedForLot = useCallback(
    async (picked: ProductPickRow) => {
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
          body: JSON.stringify({ productId: picked.id }),
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
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }} component="h1">
        Lot — {supplierName}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-4">
        Statut : <strong>{lot.status}</strong>
        {lot.marque_prete_at ? ` — prêt le ${new Date(lot.marque_prete_at).toLocaleString("fr-FR")}` : null}
      </Typography>

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

      <Typography variant="subtitle2" className="!mb-1" sx={{ fontWeight: 600 }}>
        Commandes incluses
      </Typography>
      <ul className="!mb-4 list-inside list-disc text-sm text-slate-700">
        {(lot.commande_fournisseur_lot_inclusion ?? []).map((inc) => {
          const cf = inc.commande_fournisseur;
          if (!cf) {
            return null;
          }
          return (
            <li key={cf.id}>
              {magLabel(cf.magasins)} <span className="text-slate-500">({cf.status})</span>
            </li>
          );
        })}
      </ul>

      <Typography variant="subtitle2" className="!mb-2" sx={{ fontWeight: 600 }}>
        Matrice besoins (par magasin)
      </Typography>
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
              {lignes.map((l) => {
                const p = normalizeProduct(l.product);
                const display = buildLotProductDisplayInfo(
                  p
                    ? {
                        ref_sales_unit: p.ref_sales_unit,
                        product_packaging: p.product_packaging,
                      }
                    : null,
                );
                const mags = magasinColumns.map((col) => {
                  const c = l.commande_fournisseur_lot_ligne_magasin?.find((x) => x.magasin_id === col.id);
                  return c?.qte ?? 0;
                });
                const tot = mags.reduce((s, n) => s + n, 0);
                const soitLine = buildSoitLine(display, tot);
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
                      return (
                        <TableCell key={col.id} align="right">
                          {editable ? (
                            <TextField
                              type="number"
                              value={v}
                              size="small"
                              disabled={rowSaving === l.id}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const n = Math.max(
                                  0,
                                  Math.min(1_000_000_000, Math.floor(Number.parseFloat(raw) || 0)),
                                );
                                updateLocalQte(l.id, col.id, n);
                              }}
                              onFocus={() => {
                                cellFocusBaseline.current[cellKey] = v;
                              }}
                              onBlur={() => {
                                const before = cellFocusBaseline.current[cellKey] ?? 0;
                                const after = mags[i] ?? 0;
                                if (before !== after) {
                                  void patchMagasinQte(l.id, col.id, after);
                                }
                              }}
                              slotProps={{ htmlInput: { min: 0, step: 1 } }}
                              sx={{ width: 84, "& input": { textAlign: "right" } }}
                            />
                          ) : (
                            v
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell align="right" sx={{ verticalAlign: "middle" }}>
                      <Typography variant="body2" component="span" sx={{ fontWeight: 700 }}>
                        {tot}
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {lot.status === "brouillon" ? (
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
        ) : null}
        <Button
          component={AppLink}
          href="/commandes-fournisseur/validation"
          variant="outlined"
          sx={{ textTransform: "none" }}
        >
          Retour validation
        </Button>
        <Button component={AppLink} href="/commandes-fournisseur" color="inherit" sx={{ textTransform: "none" }}>
          Hub commandes
        </Button>
      </div>

      <CommandeFournisseurProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        supplierId={lot.supplier_id}
        existingProductIds={lignes.map((l) => l.product_id)}
        alreadyPresentLabel="Déjà dans le lot"
        onSelect={(p) => void handleProductPickedForLot(p)}
      />
    </main>
  );
}
