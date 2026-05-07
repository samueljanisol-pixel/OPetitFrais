"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Typography } from "@mui/material";
import { DecimalQtyTextField } from "@/components/commandes-fournisseur/DecimalQtyTextField";
import { clampQtyToApiRange, roundQty2 } from "@/lib/commandes-fournisseur/qty-parse";

export type PPack = {
  id: string;
  conditionnement_id: string;
  quantity: string | number;
  ref_conditionnement?: unknown;
  ref_sales_unit?: unknown;
};

export type ParcoursProductForQty = {
  id: string;
  ref_sales_unit?: unknown;
  product_packaging: PPack[] | PPack | null | undefined;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-0.5">
          <Button size="small" variant="outlined" onClick={step(-10)} disabled={value < 10}>
            -10
          </Button>
          <Button size="small" variant="outlined" onClick={step(-1)} disabled={value < 1}>
            -1
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1">
          <DecimalQtyTextField
            size="small"
            value={clampQtyToApiRange(value)}
            onQtyChange={(n) => onChange(clampQtyToApiRange(n))}
            sx={{ flex: "0 1 auto", minWidth: "4.75rem", maxWidth: "7rem", "& input": { textAlign: "center" } }}
            slotProps={{ htmlInput: { "aria-label": `Quantité ${unitLabel}` } }}
          />
          <Typography variant="body2" color="text.secondary" className="shrink-0 whitespace-nowrap">
            {unitLabel}
          </Typography>
        </div>
        <div className="flex gap-0.5">
          <Button size="small" variant="outlined" onClick={step(1)}>
            +1
          </Button>
          <Button size="small" variant="outlined" onClick={step(10)}>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-0.5 shrink-0">
          <Button size="small" variant="outlined" onClick={step(-10)} disabled={value < 10}>
            -10
          </Button>
          <Button size="small" variant="outlined" onClick={step(-1)} disabled={value < 1}>
            -1
          </Button>
        </div>
        <DecimalQtyTextField
          size="small"
          value={clampQtyToApiRange(value)}
          onQtyChange={(n) => onChange(clampQtyToApiRange(n))}
          sx={{ flex: "0 1 auto", minWidth: "4rem", maxWidth: "7rem", "& input": { textAlign: "center" } }}
          slotProps={{ htmlInput: { "aria-label": "Quantité colis" } }}
        />
        <div className="flex gap-0.5 shrink-0">
          <Button size="small" variant="outlined" onClick={step(1)}>
            +1
          </Button>
          <Button size="small" variant="outlined" onClick={step(10)}>
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

export type ParcoursProductQuantityPanelProps = {
  product: ParcoursProductForQty;
  route: PackRoute;
  onSelectRoute: (route: PackRoute) => void;
  getQ: (key: string) => number;
  setQuantityForKey: (key: string, value: number) => void;
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
        <Button
          type="button"
          size="small"
          variant={route === "unit" ? "contained" : "outlined"}
          color="success"
          onClick={() => onSelectRoute("unit")}
          sx={{ textTransform: "none" }}
        >
          À l’unité ({productUnit})
        </Button>
        {packs.map((pkg) => {
          const cond = refLabel(pkg.ref_conditionnement);
          const pq = packQtyValue(pkg);
          const pkUnit = refLabel(pkg.ref_sales_unit);
          const shortT = cond !== "—" ? cond : "Colis";
          const spec = `(${formatQtyDisplay(pq)} ${pkUnit})`;
          return (
            <Button
              key={pkg.id}
              type="button"
              size="small"
              variant={route === pkg.id ? "contained" : "outlined"}
              color="success"
              onClick={() => onSelectRoute(pkg.id)}
              sx={{ textTransform: "none" }}
            >
              {shortT} {spec}
            </Button>
          );
        })}
      </div>
      {hideQuantityControls ? (
        <Typography variant="body2" color="text.secondary">
          Les quantités se saisissent par magasin dans la matrice.
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
          const cond = refLabel(pkg.ref_conditionnement);
          const condName = cond !== "—" ? cond : "Colis";
          const pq = packQtyValue(pkg);
          const pkUnit = refLabel(pkg.ref_sales_unit);
          const v = getQ(pKeyForProduct(p.id, pkg.id));
          const total = v * pq;
          const condWithPackSpec = `${condName} (${formatQtyDisplay(pq)} ${pkUnit})`;
          const soitLine = v > 0 ? `Soit ${formatQtyDisplay(total)} ${productUnit}` : null;
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

/** État local (un produit) aligné sur ParcoursClient : route + quantités exclusives. */
export function useSingleProductParcoursQuantity(
  product: ParcoursProductForQty | null,
  open: boolean,
  /** Fournisseur de la commande : conditionnement préféré si-lié dans le référentiel. */
  commandSupplierId: string | null = null,
): {
  snapshot: ParcoursProductQtySnapshot | null;
  panelProps: ParcoursProductQuantityPanelProps | null;
  packRoute: PackRoute;
} {
  const [packRoute, setPackRoute] = useState<PackRoute>("unit");
  const [qtes, setQtes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!product || !open) {
      return;
    }
    const pArr = packArray(product.product_packaging);
    setPackRoute(preferredPackRoute(pArr, commandSupplierId ?? null));
    setQtes({});
  }, [product?.id, open, commandSupplierId]);

  const selectRoute = useCallback(
    (route: PackRoute) => {
      if (!product) {
        return;
      }
      const pid = product.id;
      const pList = packArray(product.product_packaging);
      setPackRoute(route);
      setQtes((prev) => {
        const next = { ...prev };
        delete next[uKeyForProduct(pid)];
        for (const pkg of pList) {
          delete next[pKeyForProduct(pid, pkg.id)];
        }
        return next;
      });
    },
    [product],
  );

  const setQForKey = useCallback(
    (key: string, v: number) => {
      if (!product) {
        return;
      }
      const pid = product.id;
      setQtes((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k === uKeyForProduct(pid) || (k.startsWith("p:") && k.split(":")[1] === pid)) {
            delete next[k];
          }
        }
        if (clampQtyToApiRange(v) > 0) {
          next[key] = clampQtyToApiRange(v);
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
    [product],
  );

  const getQ = useCallback((k: string) => qtes[k] ?? 0, [qtes]);

  const snapshot = useMemo(() => {
    if (!product) {
      return null;
    }
    return snapshotFromParcoursKeys(product.id, packRoute, getQ);
  }, [product, packRoute, getQ]);

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
    };
  }, [product, packRoute, selectRoute, getQ, setQForKey]);

  return { snapshot, panelProps, packRoute };
}
