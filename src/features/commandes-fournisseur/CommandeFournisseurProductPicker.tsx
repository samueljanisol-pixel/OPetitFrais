"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import ProductArabicSubtitle from "@/components/ProductArabicSubtitle";

export type ProductPickRow = {
  id: string;
  code: string;
  name: string;
  /** Nom en arabe (réf. produit). */
  name_ar?: string | null;
  category_id?: string | null;
  supplier_id?: string;
  allow_unit_in_commande?: boolean | null;
  ref_category?: unknown;
  ref_sales_unit?: unknown;
  ref_supplier?: unknown;
  product_packaging?: unknown;
};

function toIdSet(ids: Set<string> | readonly string[] | undefined): Set<string> {
  if (!ids) {
    return new Set();
  }
  return ids instanceof Set ? ids : new Set(ids);
}

function refSupplierLabel(raw: unknown): string | null {
  const o = (Array.isArray(raw) ? raw[0] : raw) as { label?: string } | null | undefined;
  const t = o?.label?.trim();
  return t ? String(t) : null;
}

type CategoryOpt = { id: string; label: string | null; sort_order: number | null };

export type CommandeFournisseurProductPickerProps = {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  /** Filtre les colis non achetables pour ce magasin (commande fournisseur). */
  magasinId?: string | null;
  /**
   * IDs produits déjà présents (lot validation/achat : un produit par lot).
   * Omis ou vide pour une commande : le même produit peut être ajouté avec un autre conditionnement.
   */
  existingProductIds?: Set<string> | readonly string[];
  /** Texte badge « présent » (ex. Déjà dans la commande / le lot). */
  alreadyPresentLabel?: string;
  onSelect: (product: ProductPickRow) => void;
};

const DEBOUNCE_MS = 300;

export default function CommandeFournisseurProductPicker({
  open,
  onClose,
  supplierId,
  magasinId = null,
  existingProductIds,
  alreadyPresentLabel = "Déjà dans la commande",
  onSelect,
}: CommandeFournisseurProductPickerProps) {
  const existing = useMemo(() => toIdSet(existingProductIds ?? []), [existingProductIds]);
  /** Par défaut : catalogue limité au fournisseur du contexte (commande / lot). */
  const [limitToDefaultSupplier, setLimitToDefaultSupplier] = useState(true);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [products, setProducts] = useState<ProductPickRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searchHint, setSearchHint] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) {
      setLimitToDefaultSupplier(true);
      setQ("");
      setDebouncedQ("");
      setCategoryId("");
      setProducts([]);
      setErr(null);
      setSearchHint(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !supplierId) {
      return;
    }
    setCatLoading(true);
    setErr(null);
    let cancelled = false;
    const only = limitToDefaultSupplier ? "true" : "false";
    void (async () => {
      try {
        const res = await fetch(
          `/api/commandes-fournisseur/produits/categories?supplierId=${encodeURIComponent(supplierId)}&onlySupplier=${only}`,
          { credentials: "include" },
        );
        const j = (await res.json()) as { categories?: CategoryOpt[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setErr(j.error ?? "Erreur");
          return;
        }
        if (!cancelled) {
          setCategories(j.categories ?? []);
        }
      } catch {
        if (!cancelled) setErr("Erreur réseau");
      } finally {
        if (!cancelled) setCatLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supplierId, limitToDefaultSupplier]);

  useEffect(() => {
    if (!limitToDefaultSupplier) {
      setCategoryId("");
    }
  }, [limitToDefaultSupplier]);

  useEffect(() => {
    if (!open || !supplierId) {
      return;
    }
    setLoading(true);
    setErr(null);
    setSearchHint(null);
    let cancelled = false;
    const params = new URLSearchParams({
      supplierId,
      onlySupplier: limitToDefaultSupplier ? "true" : "false",
    });
    if (debouncedQ.length > 0) {
      params.set("q", debouncedQ);
    }
    if (categoryId.length > 0) {
      params.set("categoryId", categoryId);
    }
    const m = magasinId?.trim();
    if (m) {
      params.set("magasinId", m);
    }
    void (async () => {
      try {
        const res = await fetch(`/api/commandes-fournisseur/produits/search?${params.toString()}`, {
          credentials: "include",
        });
        const j = (await res.json()) as { products?: ProductPickRow[]; error?: string; hint?: string };
        if (!res.ok) {
          if (!cancelled) setErr(j.error ?? "Erreur");
          setProducts([]);
          return;
        }
        if (!cancelled) {
          setProducts(j.products ?? []);
          setSearchHint(typeof j.hint === "string" ? j.hint : null);
        }
      } catch {
        if (!cancelled) {
          setErr("Erreur réseau");
          setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supplierId, debouncedQ, categoryId, limitToDefaultSupplier, magasinId]);

  const onPick = useCallback(
    (p: ProductPickRow) => {
      onSelect(p);
      onClose();
    },
    [onSelect, onClose],
  );

  const categoryLabel = (c: CategoryOpt) => {
    const t = c.label?.trim();
    return t ? String(t) : "—";
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ pb: 0 }}>Rechercher un produit</DialogTitle>
      <DialogContent>
        <FormControlLabel
          className="!mb-3 !mr-0"
          control={
            <Checkbox
              checked={limitToDefaultSupplier}
              onChange={(e) => setLimitToDefaultSupplier(e.target.checked)}
              size="small"
            />
          }
          label="Limiter au fournisseur prévu pour cette commande / ce lot"
        />
        <div className="mb-3 flex flex-col gap-3 pt-0">
          <TextField
            size="small"
            fullWidth
            label="Nom ou code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder={limitToDefaultSupplier ? "Tapez au moins une lettre…" : "2 caractères min. ou catégorie…"}
          />
          <FormControl size="small" fullWidth disabled={catLoading}>
            <InputLabel id="ccf-cat">Catégorie</InputLabel>
            <Select
              labelId="ccf-cat"
              label="Catégorie"
              value={categoryId}
              onChange={(e) => setCategoryId(String(e.target.value))}
            >
              <MenuItem value="">Toutes les catégories</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {categoryLabel(c)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {!limitToDefaultSupplier ? (
            <Typography variant="caption" color="text.secondary">
              Recherche sur tout le catalogue : indiquez un critère ou choisissez une catégorie.
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Catalogue du fournisseur attendu uniquement (décochez pour élargir).
            </Typography>
          )}
        </div>
        {err ? (
          <Typography color="error" variant="body2" className="!mb-2">
            {err}
          </Typography>
        ) : null}
        {searchHint ? (
          <Typography variant="body2" color="text.secondary" className="!mb-2">
            {searchHint}
          </Typography>
        ) : null}
        <Box sx={{ minHeight: 200 }}>
          {loading ? (
            <div className="flex justify-center py-6">
              <CircularProgress size={28} />
            </div>
          ) : (
            <List dense disablePadding sx={{ maxHeight: 320, overflow: "auto" }}>
              {products.map((p) => {
                const present = existing.has(p.id);
                const sup = !limitToDefaultSupplier ? refSupplierLabel(p.ref_supplier) : null;
                return (
                  <ListItemButton key={p.id} disabled={present} onClick={() => (present ? undefined : onPick(p))}>
                    <ListItemText
                      primary={
                        <span className="flex flex-col items-stretch gap-0.5">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-slate-500">({p.code})</span>
                            {sup ? (
                              <Chip label={sup} size="small" variant="outlined" sx={{ ml: 0.5 }} />
                            ) : null}
                            {present ? (
                              <Chip label={alreadyPresentLabel} size="small" color="default" sx={{ ml: 0.5 }} />
                            ) : null}
                          </span>
                          <ProductArabicSubtitle nameAr={p.name_ar} />
                        </span>
                      }
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
          {!loading && products.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Aucun produit correspondant.
            </Typography>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" sx={{ textTransform: "none" }}>
          Annuler
        </Button>
      </DialogActions>
    </Dialog>
  );
}
