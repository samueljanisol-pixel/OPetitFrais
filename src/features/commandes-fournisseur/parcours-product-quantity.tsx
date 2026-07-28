"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import { DecimalQtyTextField } from "@/components/commandes-fournisseur/DecimalQtyTextField";
import { clampQtyToApiRange, roundQty2 } from "@/lib/commandes-fournisseur/qty-parse";
import {
  labelFromRefForLocale,
  orderUnitLabelForLocale,
  packagingConditionnementLabelForLocale,
} from "@/lib/commandes-fournisseur/product-display";
import { commandeAllowsUnitProduct } from "@/lib/products/packagingEligibility";
import { conditionnementSupplierId } from "@/lib/products/packagingSupplierMatch";
import { useAppFormat } from "@/lib/i18n/useAppFormat";

const routeChipButtonBaseSx: SxProps<Theme> = { textTransform: "none" };

/** Style renforcé pour la puce du mode actif (conditionnement ou unité). */
function routeChipButtonSx(isSelected: boolean): SxProps<Theme> {
  if (!isSelected) {
    return routeChipButtonBaseSx;
  }
  return (theme) => ({
    textTransform: "none",
    fontWeight: 700,
    px: 1.5,
    py: 0.875,
    boxShadow: theme.shadows[4],
    border: `2px solid ${alpha(theme.palette.common.white, 0.45)}`,
    "&:hover": {
      boxShadow: theme.shadows[6],
    },
  });
}

/** Pastille qté sur les puces conditionnement / unité (quantité saisie ailleurs). */
function RouteChipQtyBadge({ qty }: { qty: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ml: 0.5,
        minWidth: "1.75rem",
        height: "1.75rem",
        px: 0.375,
        borderRadius: "9999px",
        bgcolor: "#fff",
        color: "#111",
        fontWeight: 800,
        fontSize: "0.8125rem",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        border: "1.5px solid",
        borderColor: (theme) =>
          theme.palette.mode === "dark" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.22)",
        boxShadow: (theme) =>
          theme.palette.mode === "dark"
            ? "0 1px 3px rgba(0,0,0,0.45)"
            : "0 1px 4px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
    >
      {qty}
    </Box>
  );
}

/** Boutons ±1 / ±10 (parcours mobile) — zone tactile plus large. */
const parcoursQtyStepButtonSx: SxProps<Theme> = {
  minWidth: "2.85rem",
  minHeight: "2.75rem",
  px: 1.125,
  py: 1,
  fontSize: "0.9375rem",
  fontWeight: 600,
  lineHeight: 1.2,
};

/** Grille 2×2 : paire du haut + demi-pas en pleine largeur (gauche et droite identiques). */
const parcoursQtyStepPairGridSx: SxProps<Theme> = (theme) => ({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(2.85rem, 1fr))",
  gap: 1,
  flexShrink: 0,
  width: `calc(2 * 2.85rem + ${theme.spacing(1)})`,
});

const parcoursQtyHalfStepButtonSx: SxProps<Theme> = {
  ...parcoursQtyStepButtonSx,
  gridColumn: "1 / -1",
  width: "100%",
  minWidth: 0,
};

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
  ref_order_unit?: unknown;
  product_packaging: PPack[] | PPack | null | undefined;
  /** Si false, pas de commande à l’unité (uniquement colis éligibles). */
  allow_unit_in_commande?: boolean | null;
};

/** Cast sûr depuis une ligne API / picker (conditionnements au même format que le parcours). */
export function parcoursShapeFromPickRow(p: {
  id: string;
  ref_sales_unit?: unknown;
  ref_order_unit?: unknown;
  product_packaging?: unknown;
}): ParcoursProductForQty {
  return {
    id: p.id,
    ref_sales_unit: p.ref_sales_unit,
    ref_order_unit: p.ref_order_unit,
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
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n);
}

export function packQtyValue(pkg: PPack): number {
  return typeof pkg.quantity === "string" ? parseFloat(pkg.quantity) : Number(pkg.quantity);
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

export type ParcoursCategoryNavItem = {
  key: string;
  label: string;
  startIndex: number;
};

export function categoryKeyForProduct(p: {
  category_id?: string | null;
  ref_category?: unknown;
}): string {
  const cid = typeof p.category_id === "string" ? p.category_id.trim() : "";
  if (cid.length > 0) {
    return cid;
  }
  return parseCategoryLabel(p.ref_category);
}

/** Indices de début de chaque catégorie dans la liste parcours (ordre API). */
export function buildParcoursCategoryNav(
  products: Array<{ category_id?: string | null; ref_category?: unknown }>,
): ParcoursCategoryNavItem[] {
  const items: ParcoursCategoryNavItem[] = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i]!;
    const key = categoryKeyForProduct(p);
    if (items.length > 0 && items[items.length - 1]!.key === key) {
      continue;
    }
    items.push({ key, label: parseCategoryLabel(p.ref_category), startIndex: i });
  }
  return items;
}

const QTY_HALF_STEP = 0.5;

/** Croix rouge à droite du champ (position absolue : le champ reste centré, pas de décalage). */
function ParcoursQtyInputWithClear({
  value,
  onChange,
  children,
}: {
  value: number;
  onChange: (n: number) => void;
  children: ReactNode;
}) {
  const tc = useTranslations("backoffice.commandes.common");
  const showClear = roundQty2(value) > 0;

  return (
    <Box sx={{ position: "relative", display: "inline-flex" }}>
      {children}
      <IconButton
        size="small"
        color="error"
        disabled={!showClear}
        onClick={() => onChange(0)}
        aria-label={tc("resetQtyToZeroAria")}
        sx={{
          position: "absolute",
          left: "100%",
          top: "50%",
          transform: "translateY(-50%)",
          ml: 0.5,
          visibility: showClear ? "visible" : "hidden",
          pointerEvents: showClear ? "auto" : "none",
        }}
      >
        <CloseIcon sx={{ fontSize: "1.125rem" }} />
      </IconButton>
    </Box>
  );
}

function ParcoursQtyStepControls({
  value,
  onChange,
  center,
}: {
  value: number;
  onChange: (n: number) => void;
  center: ReactNode;
}) {
  const { formatNumber } = useAppFormat();
  const v = roundQty2(value);
  const step =
    (d: number) => () =>
      onChange(Math.max(0, roundQty2(v + d)));
  const halfQty = formatNumber(QTY_HALF_STEP, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <Box sx={parcoursQtyStepPairGridSx}>
        <Button
          size="medium"
          variant="outlined"
          onClick={step(-10)}
          disabled={v < 10}
          sx={parcoursQtyStepButtonSx}
        >
          -10
        </Button>
        <Button
          size="medium"
          variant="outlined"
          onClick={step(-1)}
          disabled={v < 1}
          sx={parcoursQtyStepButtonSx}
        >
          -1
        </Button>
        <Button
          size="medium"
          variant="outlined"
          onClick={step(-QTY_HALF_STEP)}
          disabled={v < QTY_HALF_STEP}
          sx={parcoursQtyHalfStepButtonSx}
        >
          − {halfQty}
        </Button>
      </Box>
      <div className="flex min-w-0 flex-1 items-center justify-center">{center}</div>
      <Box sx={parcoursQtyStepPairGridSx}>
        <Button size="medium" variant="outlined" onClick={step(1)} sx={parcoursQtyStepButtonSx}>
          +1
        </Button>
        <Button size="medium" variant="outlined" onClick={step(10)} sx={parcoursQtyStepButtonSx}>
          +10
        </Button>
        <Button
          size="medium"
          variant="outlined"
          onClick={step(QTY_HALF_STEP)}
          sx={parcoursQtyHalfStepButtonSx}
        >
          + {halfQty}
        </Button>
      </Box>
    </div>
  );
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
  const tc = useTranslations("backoffice.commandes.common");
  return (
    <div className="flex flex-col gap-1">
      <ParcoursQtyStepControls
        value={value}
        onChange={onChange}
        center={
          <ParcoursQtyInputWithClear value={value} onChange={onChange}>
            <DecimalQtyTextField
              size="small"
              value={clampQtyToApiRange(value)}
              onQtyChange={(n) => onChange(clampQtyToApiRange(n ?? 0))}
              sx={{
                width: "4.75rem",
                minWidth: "4.75rem",
                flexShrink: 0,
                "& .MuiInputBase-input": { textAlign: "center", py: 0.65 },
              }}
              slotProps={{ htmlInput: { "aria-label": tc("quantityForUnitAria", { unitLabel }) } }}
            />
          </ParcoursQtyInputWithClear>
        }
      />
      <Typography
        variant="body2"
        component="p"
        className="!font-medium !m-0 text-center leading-snug"
      >
        {unitLabel}
      </Typography>
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
  const tc = useTranslations("backoffice.commandes.common");
  return (
    <div className="flex flex-col gap-1">
      <ParcoursQtyStepControls
        value={value}
        onChange={onChange}
        center={
          <ParcoursQtyInputWithClear value={value} onChange={onChange}>
            <DecimalQtyTextField
              size="small"
              value={clampQtyToApiRange(value)}
              onQtyChange={(n) => onChange(clampQtyToApiRange(n ?? 0))}
              sx={{
                width: "4.75rem",
                minWidth: "4.75rem",
                flexShrink: 0,
                "& .MuiInputBase-input": { textAlign: "center", py: 0.65 },
              }}
              slotProps={{ htmlInput: { "aria-label": tc("quantityColisAria") } }}
            />
          </ParcoursQtyInputWithClear>
        }
      />
      <Typography
        variant="body2"
        component="p"
        className="!font-medium !m-0 text-center leading-snug"
      >
        {condWithPackSpec}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        component="p"
        className="!mt-0.5 min-h-[1.25rem] text-right"
        aria-hidden={!soitLine}
        sx={{ visibility: soitLine ? "visible" : "hidden" }}
      >
        {soitLine ?? "\u00a0"}
      </Typography>
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
  const t = useTranslations("backoffice.commandes.quantityPanel");
  const tc = useTranslations("backoffice.commandes.common");
  const { formatNumber, locale } = useAppFormat();
  const p = product;
  const packs = packArray(p.product_packaging);
  const productUnit = orderUnitLabelForLocale(p.ref_order_unit, p.ref_sales_unit, locale);
  const uk = uKeyForProduct(p.id);
  const formatQty = useCallback(
    (value: number) =>
      formatNumber(value, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      }),
    [formatNumber],
  );

  if (packs.length === 0) {
    if (hideQuantityControls) {
      return (
        <Typography variant="body2" color="text.secondary">
          {t("matrixQtyHint")}
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
            variant={route === "unit" ? "contained" : "outlined"}
            color="success"
            onClick={() => onSelectRoute("unit")}
            sx={routeChipButtonSx(route === "unit")}
          >
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 0.25,
                fontWeight: route === "unit" ? 700 : 400,
              }}
            >
              <span>{t("unitButton", { unit: productUnit })}</span>
              {getQ(uk) > 0 && route !== "unit" ? (
                <RouteChipQtyBadge qty={formatQty(getQ(uk))} />
              ) : null}
            </Box>
          </Button>
        ) : null}
        {packs.map((pkg) => {
          const pq = packQtyValue(pkg);
          const pkUnit = labelFromRefForLocale(pkg.ref_sales_unit, locale);
          const shortT = packagingConditionnementLabelForLocale(pkg, locale);
          const formattedPackQty = formatQty(pq);
          const pk = pKeyForProduct(p.id, pkg.id);
          const qPack = getQ(pk);
          const packSelected = route === pkg.id;
          return (
            <Button
              key={pkg.id}
              type="button"
              size="small"
              variant={packSelected ? "contained" : "outlined"}
              color="success"
              onClick={() => onSelectRoute(pkg.id)}
              sx={routeChipButtonSx(packSelected)}
            >
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 0.25,
                  fontWeight: packSelected ? 700 : 400,
                }}
              >
                <span>
                  {t("packButton", {
                    label: shortT,
                    packQty: formattedPackQty,
                    unit: pkUnit,
                  })}
                </span>
                {qPack > 0 && !packSelected ? (
                  <RouteChipQtyBadge qty={formatQty(qPack)} />
                ) : null}
              </Box>
            </Button>
          );
        })}
      </div>
      {hideQuantityControls ? (
        <Typography variant="body2" color="text.secondary">
          {t("matrixQtyHintShort")}
        </Typography>
      ) : route === "unit" && !allowUnitInCommande ? (
        <Typography variant="body2" color="text.secondary">
          {t("packagingOnly")}
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
          const condName = packagingConditionnementLabelForLocale(pkg, locale);
          const pq = packQtyValue(pkg);
          const pkUnit = labelFromRefForLocale(pkg.ref_sales_unit, locale);
          const v = getQ(pKeyForProduct(p.id, pkg.id));
          const total = v * pq;
          const condWithPackSpec = t("packButton", {
            label: condName,
            packQty: formatQty(pq),
            unit: pkUnit,
          });
          const soitLine =
            v > 0 ? tc("soitLine", { qty: formatQty(total), unit: pkUnit }) : null;
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
