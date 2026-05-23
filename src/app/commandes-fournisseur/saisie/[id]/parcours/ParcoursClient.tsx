"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Box, Button, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AppLink from "@/components/AppLink";
import ProductArabicSubtitle from "@/components/ProductArabicSubtitle";
import {
  type PackRoute,
  type ParcoursProductForQty,
  ParcoursProductQuantityPanel,
  packArray,
  parseCategoryLabel,
  preferredPackRoute,
  pKeyForProduct,
  uKeyForProduct,
} from "@/features/commandes-fournisseur/parcours-product-quantity";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import {
  buildParcoursQtesFromLignes,
  findParcoursProductIndex,
} from "@/lib/commandes-fournisseur/build-parcours-qtes-from-lignes";
import {
  clearParcoursDraft,
  loadParcoursDraft,
  saveParcoursDraft,
} from "@/lib/commandes-fournisseur/parcours-draft-storage";
import { clampQtyToApiRange } from "@/lib/commandes-fournisseur/qty-parse";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import { commandeAllowsUnitProduct } from "@/lib/products/packagingEligibility";

type Product = ParcoursProductForQty & {
  name: string;
  name_ar?: string | null;
  code: string;
  ref_category: unknown;
  photoUrl?: string | null;
};

type LigneIn = { product_id: string; product_packaging_id: string | null; qte: number };

export default function ParcoursClient({ commandeId }: { commandeId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: permLoading, can, canWriteProducts } = useSessionPermissions();
  const t = useTranslations("backoffice.commandes.parcours");
  const tc = useTranslations("backoffice.commandes.common");
  const te = useTranslations("backoffice.commandes.errors");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const canOpenProductFiche = canWriteProducts || can("produits.read");
  const [products, setProducts] = useState<Product[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [qtes, setQtes] = useState<Record<string, number>>({});
  const [packRoute, setPackRoute] = useState<Record<string, PackRoute>>({});
  const [commandeSupplierId, setCommandeSupplierId] = useState<string | null>(null);
  const [commandeMagasinId, setCommandeMagasinId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshingProduct, setRefreshingProduct] = useState(false);
  const indexRef = useRef(0);
  const productsRef = useRef<Product[]>([]);
  indexRef.current = index;
  productsRef.current = products;

  const n = products.length;
  const current = n > 0 && index < n ? products[index] : null;

  const uKey = useCallback((pid: string) => uKeyForProduct(pid), []);
  const pKey = useCallback((pid: string, pk: string) => pKeyForProduct(pid, pk), []);

  const getQ = useCallback(
    (k: string) => qtes[k] ?? 0,
    [qtes],
  );

  const getRoute = useCallback(
    (product: Product): PackRoute => {
      const pr = packRoute[product.id];
      if (pr !== undefined) return pr;
      const packs = packArray(product.product_packaging);
      return preferredPackRoute(packs, commandeSupplierId);
    },
    [packRoute, commandeSupplierId],
  );

  const selectRoute = useCallback((p: Product, route: PackRoute) => {
    setPackRoute((prev) => ({ ...prev, [p.id]: route }));
  }, []);

  /** Plusieurs quantités par produit : à l’unité et/ou plusieurs conditionnements. */
  const setQForKey = useCallback(
    (p: Product, key: string, v: number) => {
      const clamped = clampQtyToApiRange(v);
      setQtes((prev) => {
        const next = { ...prev };
        if (clamped > 0) {
          next[key] = clamped;
        } else {
          delete next[key];
        }
        return next;
      });
      if (key === uKey(p.id)) {
        setPackRoute((r) => ({ ...r, [p.id]: "unit" }));
      } else {
        const parts = key.split(":");
        if (parts[0] === "p" && parts[1] === p.id && parts[2]) {
          setPackRoute((r) => ({ ...r, [p.id]: parts[2]! }));
        }
      }
    },
    [uKey],
  );

  const parcoursReturnTo = useMemo(() => {
    const base = `/commandes-fournisseur/saisie/${commandeId}/parcours`;
    if (!current?.id) {
      return base;
    }
    return `${base}?productId=${encodeURIComponent(current.id)}`;
  }, [commandeId, current?.id]);

  const persistDraft = useCallback(() => {
    const list = productsRef.current;
    const idx = indexRef.current;
    const pid = list[idx]?.id ?? null;
    saveParcoursDraft(commandeId, {
      qtes,
      packRoute,
      index: idx,
      focusProductId: pid,
    });
  }, [commandeId, packRoute, qtes]);

  const reconcileProductInState = useCallback(
    (updated: Product) => {
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      const packs = packArray(updated.product_packaging);
      const validKeys = new Set([
        uKey(updated.id),
        ...packs.map((pk) => pKey(updated.id, pk.id)),
      ]);
      setQtes((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k === uKey(updated.id) || (k.startsWith("p:") && k.split(":")[1] === updated.id)) {
            if (!validKeys.has(k)) {
              delete next[k];
            }
          }
        }
        return next;
      });
      setPackRoute((prev) => {
        const cur = prev[updated.id];
        if (cur === "unit") {
          if (commandeAllowsUnitProduct(updated.allow_unit_in_commande) || packs.length === 0) {
            return prev;
          }
        } else if (typeof cur === "string" && packs.some((pk) => pk.id === cur)) {
          return prev;
        }
        const nextRoute =
          packs.length === 0 ? "unit" : preferredPackRoute(packs, commandeSupplierId);
        return { ...prev, [updated.id]: nextRoute };
      });
    },
    [commandeSupplierId, pKey, uKey],
  );

  const refreshCurrentProduct = useCallback(async () => {
    const pid = productsRef.current[indexRef.current]?.id;
    if (!pid || !commandeSupplierId) {
      return;
    }
    setRefreshingProduct(true);
    try {
      const q = new URLSearchParams({
        supplierId: commandeSupplierId,
        productId: pid,
        commandeId,
      });
      const mid = commandeMagasinId?.trim();
      if (mid) {
        q.set("magasinId", mid);
      }
      const res = await fetch(`/api/commandes-fournisseur/parcours-produits?${q.toString()}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { product?: Product; error?: string };
      if (!res.ok || !j.product) {
        return;
      }
      reconcileProductInState(j.product);
    } catch {
      /* ignore */
    } finally {
      setRefreshingProduct(false);
    }
  }, [commandeMagasinId, commandeSupplierId, reconcileProductInState]);

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        const r1 = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, { credentials: "include" });
        const j1 = (await r1.json()) as {
          commande?: { status?: string; supplier_id?: string; magasin_id?: string };
          lignes?: LigneIn[];
          error?: string;
        };
        if (!r1.ok) {
          setErr(j1.error ?? te("generic"));
          return;
        }
        if (j1.commande?.status !== "en_saisie") {
          void router.replace(`/commandes-fournisseur/saisie/${commandeId}/recap`);
          return;
        }
        const sid = j1.commande?.supplier_id;
        if (!sid) {
          setErr(te("missingSupplier"));
          return;
        }
        setCommandeSupplierId(sid);
        const magasinId = j1.commande?.magasin_id?.trim() ?? "";
        setCommandeMagasinId(magasinId.length > 0 ? magasinId : null);
        const q = new URLSearchParams({ supplierId: sid, commandeId });
        if (magasinId) q.set("magasinId", magasinId);
        const r2 = await fetch(`/api/commandes-fournisseur/parcours-produits?${q.toString()}`, {
          credentials: "include",
        });
        const j2 = (await r2.json()) as { products?: Product[]; error?: string };
        if (!r2.ok) {
          setErr(j2.error ?? te("generic"));
          return;
        }
        const list = j2.products ?? [];
        setProducts(list);

        const fromDb = buildParcoursQtesFromLignes(list, j1.lignes ?? [], sid);
        const draft = loadParcoursDraft(commandeId);
        const mergedQ = { ...fromDb.qtes, ...(draft?.qtes ?? {}) };
        const mergedRoute = { ...fromDb.packRoute, ...(draft?.packRoute ?? {}) };
        setQtes(mergedQ);
        setPackRoute(mergedRoute);

        const urlProductId = searchParams.get("productId")?.trim() || null;
        const focusId = urlProductId || draft?.focusProductId || null;
        let nextIndex = 0;
        const byProduct = findParcoursProductIndex(list, focusId);
        if (byProduct >= 0) {
          nextIndex = byProduct;
        } else if (
          draft &&
          typeof draft.index === "number" &&
          draft.index >= 0 &&
          draft.index < list.length
        ) {
          nextIndex = draft.index;
        }
        setIndex(nextIndex);
      } catch (e) {
        setErr(e instanceof Error ? e.message : te("generic"));
      } finally {
        setLoading(false);
      }
    })();
  }, [commandeId, router, searchParams, te]);

  useEffect(() => {
    if (loading || products.length === 0) {
      return;
    }
    persistDraft();
  }, [loading, persistDraft, products.length]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshCurrentProduct();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshCurrentProduct]);

  const buildLignesPayload = useCallback(() => {
    const out: {
      productId: string;
      productPackagingId: string | null;
      qte: number;
      horsFournisseur: boolean;
    }[] = [];
    for (const p of products) {
      const uq = clampQtyToApiRange(getQ(uKey(p.id)));
      if (uq > 0) {
        out.push({ productId: p.id, productPackagingId: null, qte: uq, horsFournisseur: false });
      }
      for (const pkg of packArray(p.product_packaging)) {
        const q = clampQtyToApiRange(getQ(pKey(p.id, pkg.id)));
        if (q > 0) {
          out.push({ productId: p.id, productPackagingId: pkg.id, qte: q, horsFournisseur: false });
        }
      }
    }
    return out;
  }, [getQ, pKey, products, uKey]);

  const sendLignes = useCallback(async () => {
    const lignes = buildLignesPayload();
    const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}/lignes`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lignes }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(j.error ?? te("saveFailed"));
    }
  }, [buildLignesPayload, commandeId, te]);

  const onTerminer = useCallback(async () => {
    setErr(null);
    setSaving(true);
    try {
      await sendLignes();
      clearParcoursDraft(commandeId);
      void router.push(`/commandes-fournisseur/saisie/${commandeId}/recap`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setSaving(false);
    }
  }, [sendLignes, router, commandeId, te]);

  const isLast = index >= n - 1;
  const posLabel = n > 0 ? t("position", { current: index + 1, total: n }) : t("position", { current: 0, total: 0 });

  const catLabel = useMemo(() => (current ? parseCategoryLabel(current.ref_category) : ""), [current]);

  const currentBlocks = useMemo(() => {
    if (!current) return null;
    const p = current;
    return (
      <ParcoursProductQuantityPanel
        product={p}
        route={getRoute(p)}
        onSelectRoute={(route) => selectRoute(p, route)}
        getQ={getQ}
        setQuantityForKey={(key, value) => setQForKey(p, key, value)}
        allowUnitInCommande={commandeAllowsUnitProduct(p.allow_unit_in_commande)}
      />
    );
  }, [current, getQ, getRoute, selectRoute, setQForKey]);

  if (loading) {
    return <p className="px-4 py-4 text-slate-600">{t("loading")}</p>;
  }

  if (err) {
    return (
      <main className="px-4 py-4">
        <Typography color="error">{err}</Typography>
        <Button component={AppLink} href={`/commandes-fournisseur/saisie/${commandeId}/recap`} className="!mt-4">
          {t("backToRecap")}
        </Button>
      </main>
    );
  }

  if (!current || n === 0) {
    return (
      <main className="px-4 py-4">
        <Typography>{t("noActiveProducts")}</Typography>
        <Button component={AppLink} href={`/commandes-fournisseur/saisie/${commandeId}/recap`} className="!mt-4" variant="contained">
          {t("backToRecap")}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col overflow-hidden px-3 py-3">
      <div className="relative !mb-2 flex min-h-[36px] shrink-0 items-center">
        <Button
          component={AppLink}
          href={`/commandes-fournisseur/saisie/${commandeId}/recap`}
          size="small"
          color="inherit"
          startIcon={<BackChevron fontSize="small" />}
          sx={{
            textTransform: "none",
            pl: 0,
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
          }}
        >
          {t("recapLink")}
        </Button>
        <Typography
          variant="body2"
          component="p"
          className="w-full text-center tabular-nums !text-[0.9375rem] sm:!text-base"
          sx={{ fontWeight: 600, px: "6.5rem" }}
        >
          {posLabel}
        </Typography>
        {!permLoading && canOpenProductFiche ? (
          <Button
            component={AppLink}
            href={`/produits/${current.id}?returnTo=${encodeURIComponent(parcoursReturnTo)}`}
            variant="outlined"
            size="small"
            startIcon={<DescriptionOutlinedIcon fontSize="small" />}
            disabled={refreshingProduct}
            sx={{
              textTransform: "none",
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 1,
              minWidth: 0,
              px: 1,
            }}
          >
            {refreshingProduct ? tCommon("loadingEllipsis") : t("productSheet")}
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
        <Typography
          variant="body2"
          color="text.secondary"
          className="!mb-1 block w-full text-center !text-[0.9375rem] sm:!text-base"
          component="span"
          sx={{ fontWeight: 600 }}
        >
          {catLabel}
        </Typography>
        {typeof current.photoUrl === "string" && current.photoUrl.length > 0 ? (
          <div className="mb-3 flex w-full justify-center">
            <div className="relative h-36 w-full max-w-[6rem]">
              <Image
                src={current.photoUrl}
                alt=""
                fill
                className="object-contain object-center"
                sizes="(max-width: 448px) 100vw, 12rem"
              />
            </div>
          </div>
        ) : null}
        <Typography
          variant="h6"
          component="h1"
          className="!mb-1 !text-base text-center"
          sx={{ fontWeight: 600 }}
        >
          {current.name}
        </Typography>
        <ProductArabicSubtitle nameAr={current.name_ar} centered className="!mb-3" />

        <div className="flex flex-col gap-3 pb-2">
          {currentBlocks}
        </div>
      </div>

      <Box
        className="flex shrink-0 flex-col gap-4 pt-4"
        sx={{
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          pb: "max(0.75rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex min-h-[2.75rem] flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="outlined"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index <= 0}
            startIcon={<BackChevron />}
            sx={{ textTransform: "none", minHeight: 40 }}
          >
            {t("previous")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            onClick={() => setIndex((i) => i + 1)}
            disabled={isLast}
            endIcon={<ChevronRightIcon />}
            sx={{ textTransform: "none", minHeight: 40 }}
          >
            {t("next")}
          </Button>
        </div>
        <Button
          type="button"
          variant="contained"
          color="success"
          fullWidth
          size="large"
          onClick={() => void onTerminer()}
          disabled={saving}
          sx={{ textTransform: "none", minHeight: 48 }}
        >
          {saving ? tc("loadingEllipsis") : t("finish")}
        </Button>
      </Box>
    </main>
  );
}
