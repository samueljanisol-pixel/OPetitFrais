"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Typography } from "@mui/material";
import { DecimalQtyTextField } from "@/components/commandes-fournisseur/DecimalQtyTextField";
import { clampQtyToApiRange, roundQty2 } from "@/lib/commandes-fournisseur/qty-parse";
import {
  isPackSalesUnitUnite,
  packagingConditionnementLabel,
} from "@/lib/commandes-fournisseur/product-display";
import { commandeAllowsUnitProduct } from "@/lib/products/packagingEligibility";

export type PPack = {
  id: string;
  conditionnement_id: string;
  quantity: string | number;
  nom?: string | null;
  available_for_sale?: boolean | null;
  available_for_purchase?: boolean | null;
  ref_conditionnement?: unknown;
  ref_sales_unit?: unknown;
};

export type ParcoursProductForQty = {
  id: string;
  ref_sales_unit?: unknown;
  product_packaging: PPack[] | PPack | null | undefined;
  /** Si false, pas de commande à l’unité (uniquement colis éligibles). */
  allow_unit_in_commande?: boolean | null;
};

/** Cast sûr depuis une ligne API / picker (conditionnements au même format que le parcours). */
export function parcoursShapeFromPickRow(p: {
  id: string;
  ref_sales_unit?: unknown;
  product_packaging?: unknown;
}): ParcoursProductForQty {
  return {
    id: p.id,
    ref_sales_unit: p.ref_sales_unit,
    product_packaging: (p.product_packaging ?? null) as ParcoursProductForQty["product_packaging"],
  };
}

export type PackRoute = "unit" | string;

export function refLabel(raw: unknown): string {
  const o = (Array.isArray(raw) ? raw[0] : raw) as { label?: string } | null | undefined;
  return o?.label?.trim() ? String(o.label) : "—";
}

export function formatQtyDisplay(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

export function packQtyValue(pkg: PPack): number {
  return typeof pkg.quantity === "string" ? parseFloat(pkg.quantity) : Number(pkg.quantity);
}

/** UUID fournisseur rattaché au conditionnement référentiel, si défini */
export function conditionnementSupplierId(ref: unknown): string | null {
  const o = (Array.isArray(ref) ? ref[0] : ref) as { supplier_id?: string | null } | null | undefined;
  const id = o?.supplier_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Choisit le conditionnement par défaut parmi les `product_packaging` :
 * si un conditionnement référencé est explicitement lié au fournisseur de la commande, on le prend ;
 * sinon le premier conditionnement disponible (« à l’unité » hors de ce tableau).
 */
export function preferredPackRoute(
  packs: PPack[],
  commandSupplierId: string | null | undefined,
): PackRoute {
  if (packs.length === 0) {
    return "unit";
  }
  if (!commandSupplierId) {
    return packs[0]!.id;
  }
  for (const pkg of packs) {
    const sid = conditionnementSupplierId(pkg.ref_conditionnement);
    if (sid === commandSupplierId) {
      return pkg.id;
    }
  }
  return packs[0]!.id;
}

export function packArray(p: ParcoursProductForQty["product_packaging"]): PPack[] {
  if (!p) return [];
  return Array.isArray(p) ? p : [p];
}

export function parseCategoryLabel(raw: unknown): string {
  const c = (Array.isArray(raw) ? raw[0] : raw) as { label?: string } | null | undefined;
  return c?.label?.trim() ? String(c.label) : "—";
}

export function UnitQteControl({
  unitLabel,
  value,
  onChange,
}: {
  unitLabel: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const step =
    (d: number) => () =>
      onChange(Math.max(0, roundQty2(roundQty2(value) + d)));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex w-full min-w-0 items-center gap-1">
        <div className="flex shrink-0 gap-0.5">
          <Button size="small" variant="outlined" onClick={step(-10)} disabled={value < 10} sx={{ minWidth: 0, px: 0.75 }}>
            -10
          </Button>
          <Button size="small" variant="outlined" onClick={step(-1)} disabled={value < 1} sx={{ minWidth: 0, px: 0.75 }}>
            -1
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1 flex-nowrap">
          <DecimalQtyTextField
            size="small"
            value={clampQtyToApiRange(value)}
            onQtyChange={(n) => onChange(clampQtyToApiRange(n))}
            sx={{
              width: "4.75rem",
              minWidth: "4.75rem",
              flexShrink: 0,
              "& .MuiInputBase-input": { textAlign: "center", py: 0.65 },
            }}
            slotProps={{ htmlInput: { "aria-label": `Quantité ${unitLabel}` } }}
          />
          <Typography variant="body2" color="text.secondary" className="shrink-0 whitespace-nowrap">
            {unitLabel}
          </Typography>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button size="small" variant="outlined" onClick={step(1)} sx={{ minWidth: 0, px: 0.75 }}>
            +1
          </Button>
          <Button size="small" variant="outlined" onClick={step(10)} sx={{ minWidth: 0, px: 0.75 }}>
            +10
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PackQteControl({
  condWithPackSpec,
  soitLine,
  value,
  onChange,
}: {
  condWithPackSpec: string;
  soitLine: string | null;
  value: number;
  onChange: (n: number) => void;
}) {
  const step =
    (d: number) => () =>
      onChange(Math.max(0, roundQty2(roundQty2(value) + d)));
  return (
    <div className="flex flex-col gap-1">
      <Typography variant="body2" className="!font-medium leading-snug" component="p">
        {condWithPackSpec}
      </Typography>
      <div className="flex w-full min-w-0 items-center gap-1">
        <div className="flex shrink-0 gap-0.5">
          <Button size="small" variant="outlined" onClick={step(-10)} disabled={value < 10} sx={{ minWidth: 0, px: 0.75 }}>
            -10
          </Button>
          <Button size="small" variant="outlined" onClick={step(-1)} disabled={value < 1} sx={{ minWidth: 0, px: 0.75 }}>
            -1
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <DecimalQtyTextField
            size="small"
            value={clampQtyToApiRange(value)}
            onQtyChange={(n) => onChange(clampQtyToApiRange(n))}
            sx={{
              width: "4.75rem",
              minWidth: "4.75rem",
              flexShrink: 0,
              "& .MuiInputBase-input": { textAlign: "center", py: 0.65 },
            }}
            slotProps={{ htmlInput: { "aria-label": "Quantité colis" } }}
          />
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button size="small" variant="outlined" onClick={step(1)} sx={{ minWidth: 0, px: 0.75 }}>
            +1
          </Button>
          <Button size="small" variant="outlined" onClick={step(10)} sx={{ minWidth: 0, px: 0.75 }}>
            +10
          </Button>
        </div>
      </div>
      {soitLine ? (
        <Typography variant="body2" color="text.secondary" className="!mt-0.5 text-right">
          {soitLine}
        </Typography>
      ) : null}
    </div>
  );
}

export type ParcoursProductQtySnapshot = {
  product_packaging_id: string | null;
  qte: number;
};

export function uKeyForProduct(productId: string): string {
  return `u:${productId}`;
}

export function pKeyForProduct(productId: string, packId: string): string {
  return `p:${productId}:${packId}`;
}

/** Lit l’état parcours (unité vs conditionnement + quantité) pour un seul produit. */
export function snapshotFromParcoursKeys(
  productId: string,
  route: PackRoute,
  getQ: (key: string) => number,
): ParcoursProductQtySnapshot | null {
  if (route === "unit") {
    const q = getQ(uKeyForProduct(productId));
    return q > 0 ? { product_packaging_id: null, qte: q } : null;
  }
  const q = getQ(pKeyForProduct(productId, route));
  return q > 0 ? { product_packaging_id: route, qte: q } : null;
}

/** Toutes les quantités saisies pour un produit (unité + chaque conditionnement). */
export function snapshotsAllForProduct(
  product: ParcoursProductForQty,
  getQ: (key: string) => number,
): ParcoursProductQtySnapshot[] {
  const out: ParcoursProductQtySnapshot[] = [];
  const uq = getQ(uKeyForProduct(product.id));
  if (uq > 0) {
    out.push({ product_packaging_id: null, qte: uq });
  }
  for (const pkg of packArray(product.product_packaging)) {
    const q = getQ(pKeyForProduct(product.id, pkg.id));
    if (q > 0) {
      out.push({ product_packaging_id: pkg.id, qte: q });
    }
  }
  return out;
}

export type ParcoursQtySeedLigne = {
  product_packaging_id: string | null;
  qte: number;
};

export type UseSingleProductParcoursQtyOptions = {
  /** Lignes commande déjà enregistrées pour ce produit (préremplissage récap). */
  seedLignes?: ParcoursQtySeedLigne[];
  /** Ne pas effacer les autres conditionnements au changement de route (récap). */
  multiPackaging?: boolean;
};

export type ParcoursProductQuantityPanelProps = {
  product: ParcoursProductForQty;
  route: PackRoute;
  onSelectRoute: (route: PackRoute) => void;
  getQ: (key: string) => number;
  setQuantityForKey: (key: string, value: number) => void;
  /** Si false : pas de bouton « à l’unité » (produit réservé aux colis). Défaut true. */
  allowUnitInCommande?: boolean;
  /** Si true : masque les contrôles ± (lot consolidé ; quantités saisies par magasin dans la matrice). */
  hideQuantityControls?: boolean;
};

/**
 * Bloc « à l’unité / conditionnements » + contrôle quantité (même logique que le parcours produits).
 */
export function ParcoursProductQuantityPanel({
  product,
  route,
  onSelectRoute,
  getQ,
  setQuantityForKey,
  allowUnitInCommande = true,
  hideQuantityControls = false,
}: ParcoursProductQuantityPanelProps) {
  const p = product;
  const packs = packArray(p.product_packaging);
  const productUnit = refLabel(p.ref_sales_unit);
  const uk = uKeyForProduct(p.id);

  if (packs.length === 0) {
    if (hideQuantityControls) {
      return (
        <Typography variant="body2" color="text.secondary">
          Les quantités se saisissent par magasin dans la matrice du lot.
        </Typography>
      );
    }
    return (
      <UnitQteControl
        unitLabel={productUnit}
        value={getQ(uk)}
        onChange={(v) => setQuantityForKey(uk, v)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {allowUnitInCommande ? (
          <Button
            type="button"
            size="small"
            variant={
              route === "unit" || getQ(uk) > 0 ? "contained" : "outlined"
            }
            color="success"
            onClick={() => onSelectRoute("unit")}
            sx={{ textTransform: "none" }}
          >
            À l’unité ({productUnit})
            {getQ(uk) > 0 && route !== "unit" ? ` · ${formatQtyDisplay(getQ(uk))}` : ""}
          </Button>
        ) : null}
        {packs.map((pkg) => {
          const pq = packQtyValue(pkg);
          const pkUnit = refLabel(pkg.ref_sales_unit);
          const shortT = packagingConditionnementLabel(pkg);
          const spec = `(${formatQtyDisplay(pq)} ${pkUnit})`;
          const pk = pKeyForProduct(p.id, pkg.id);
          const qPack = getQ(pk);
          return (
            <Button
              key={pkg.id}
              type="button"
              size="small"
              variant={route === pkg.id || qPack > 0 ? "contained" : "outlined"}
              color="success"
              onClick={() => onSelectRoute(pkg.id)}
              sx={{ textTransform: "none" }}
            >
              {shortT} {spec}
              {qPack > 0 && route !== pkg.id ? ` · ${formatQtyDisplay(qPack)}` : ""}
            </Button>
          );
        })}
      </div>
      {hideQuantityControls ? (
        <Typography variant="body2" color="text.secondary">
          Les quantités se saisissent par magasin dans la matrice.
        </Typography>
      ) : route === "unit" && !allowUnitInCommande ? (
        <Typography variant="body2" color="text.secondary">
          Ce produit ne se commande qu’en conditionnement pour votre magasin.
        </Typography>
      ) : route === "unit" ? (
        <UnitQteControl
          unitLabel={productUnit}
          value={getQ(uk)}
          onChange={(v) => setQuantityForKey(uk, v)}
        />
      ) : (() => {
          const pkg = packs.find((x) => x.id === route);
          if (!pkg) return null;
          const condName = packagingConditionnementLabel(pkg);
          const pq = packQtyValue(pkg);
          const pkUnit = refLabel(pkg.ref_sales_unit);
          const v = getQ(pKeyForProduct(p.id, pkg.id));
          const total = v * pq;
          const condWithPackSpec = `${condName} (${formatQtyDisplay(pq)} ${pkUnit})`;
          const soitLine =
            v > 0 && !isPackSalesUnitUnite(pkg.ref_sales_unit)
              ? `Soit ${formatQtyDisplay(total)} ${productUnit}`
              : null;
          return (
            <PackQteControl
              condWithPackSpec={condWithPackSpec}
              soitLine={soitLine}
              value={v}
              onChange={(n) => setQuantityForKey(pKeyForProduct(p.id, pkg.id), n)}
            />
          );
        })()}
    </div>
  );
}

/** État local (un produit) : route + quantités (exclusives ou multi-conditionnements). */
export function useSingleProductParcoursQuantity(
  product: ParcoursProductForQty | null,
  open: boolean,
  /** Fournisseur de la commande : conditionnement préféré si-lié dans le référentiel. */
  commandSupplierId: string | null = null,
  options: UseSingleProductParcoursQtyOptions = {},
): {
  snapshot: ParcoursProductQtySnapshot | null;
  allSnapshots: ParcoursProductQtySnapshot[];
  panelProps: ParcoursProductQuantityPanelProps | null;
  packRoute: PackRoute;
  getQ: (key: string) => number;
} {
  const { seedLignes, multiPackaging = false } = options;
  const [packRoute, setPackRoute] = useState<PackRoute>("unit");
  const [qtes, setQtes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!product || !open) {
      return;
    }
    const pArr = packArray(product.product_packaging);
    const packIds = new Set(pArr.map((x) => x.id));
    const nextQ: Record<string, number> = {};
    let routeSet = false;
    let initial: PackRoute = pArr.length === 0 ? "unit" : preferredPackRoute(pArr, commandSupplierId ?? null);

    for (const l of seedLignes ?? []) {
      if (l.qte <= 0) {
        continue;
      }
      if (l.product_packaging_id && packIds.has(l.product_packaging_id)) {
        nextQ[pKeyForProduct(product.id, l.product_packaging_id)] = l.qte;
        if (!routeSet) {
          initial = l.product_packaging_id;
          routeSet = true;
        }
      } else if (!l.product_packaging_id) {
        nextQ[uKeyForProduct(product.id)] = l.qte;
        if (!routeSet) {
          initial = "unit";
          routeSet = true;
        }
      }
    }

    setPackRoute(initial);
    setQtes(nextQ);
  }, [product?.id, open, commandSupplierId, product?.allow_unit_in_commande, seedLignes, multiPackaging]);

  const selectRoute = useCallback(
    (route: PackRoute) => {
      if (!product) {
        return;
      }
      if (
        route === "unit" &&
        !commandeAllowsUnitProduct(product.allow_unit_in_commande) &&
        packArray(product.product_packaging).length > 0
      ) {
        return;
      }
      setPackRoute(route);
      if (multiPackaging) {
        return;
      }
      const pid = product.id;
      const pList = packArray(product.product_packaging);
      setQtes((prev) => {
        const next = { ...prev };
        delete next[uKeyForProduct(pid)];
        for (const pkg of pList) {
          delete next[pKeyForProduct(pid, pkg.id)];
        }
        return next;
      });
    },
    [product, multiPackaging],
  );

  const setQForKey = useCallback(
    (key: string, v: number) => {
      if (!product) {
        return;
      }
      const pid = product.id;
      const clamped = clampQtyToApiRange(v);
      setQtes((prev) => {
        const next = { ...prev };
        if (multiPackaging) {
          if (clamped > 0) {
            next[key] = clamped;
          } else {
            delete next[key];
          }
          return next;
        }
        for (const k of Object.keys(next)) {
          if (k === uKeyForProduct(pid) || (k.startsWith("p:") && k.split(":")[1] === pid)) {
            delete next[k];
          }
        }
        if (clamped > 0) {
          next[key] = clamped;
        }
        return next;
      });
      if (key === uKeyForProduct(pid)) {
        setPackRoute("unit");
      } else {
        const parts = key.split(":");
        if (parts[0] === "p" && parts[1] === pid && parts[2]) {
          setPackRoute(parts[2]!);
        }
      }
    },
    [product, multiPackaging],
  );

  const getQ = useCallback((k: string) => qtes[k] ?? 0, [qtes]);

  const snapshot = useMemo(() => {
    if (!product) {
      return null;
    }
    return snapshotFromParcoursKeys(product.id, packRoute, getQ);
  }, [product, packRoute, getQ]);

  const allSnapshots = useMemo(() => {
    if (!product) {
      return [];
    }
    return snapshotsAllForProduct(product, getQ);
  }, [product, getQ]);

  const panelProps = useMemo((): ParcoursProductQuantityPanelProps | null => {
    if (!product) {
      return null;
    }
    return {
      product,
      route: packRoute,
      onSelectRoute: selectRoute,
      getQ,
      setQuantityForKey: setQForKey,
      allowUnitInCommande: commandeAllowsUnitProduct(product.allow_unit_in_commande),
    };
  }, [product, packRoute, selectRoute, getQ, setQForKey]);

  return { snapshot, allSnapshots, panelProps, packRoute, getQ };
}
