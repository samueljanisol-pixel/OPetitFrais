"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Box, Button, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
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
import { clampQtyToApiRange } from "@/lib/commandes-fournisseur/qty-parse";
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
  const [products, setProducts] = useState<Product[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [qtes, setQtes] = useState<Record<string, number>>({});
  const [packRoute, setPackRoute] = useState<Record<string, PackRoute>>({});
  const [commandeSupplierId, setCommandeSupplierId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
          setErr(j1.error ?? "Erreur");
          return;
        }
        if (j1.commande?.status !== "en_saisie") {
          void router.replace(`/commandes-fournisseur/saisie/${commandeId}/recap`);
          return;
        }
        const sid = j1.commande?.supplier_id;
        if (!sid) {
          setErr("Fournisseur manquant");
          return;
        }
        setCommandeSupplierId(sid);
        const magasinId = j1.commande?.magasin_id?.trim() ?? "";
        const q = new URLSearchParams({ supplierId: sid });
        if (magasinId) q.set("magasinId", magasinId);
        const r2 = await fetch(`/api/commandes-fournisseur/parcours-produits?${q.toString()}`, {
          credentials: "include",
        });
        const j2 = (await r2.json()) as { products?: Product[]; error?: string };
        if (!r2.ok) {
          setErr(j2.error ?? "Erreur");
          return;
        }
        const list = j2.products ?? [];
        setProducts(list);

        const byProduct = new Map<string, LigneIn[]>();
        for (const l of j1.lignes ?? []) {
          const arr = byProduct.get(l.product_id) ?? [];
          arr.push(l);
          byProduct.set(l.product_id, arr);
        }

        const nextRoute: Record<string, PackRoute> = {};
        const nextQ: Record<string, number> = {};

        for (const p of list) {
          const packs = packArray(p.product_packaging);
          const packIds = new Set(packs.map((x) => x.id));
          const listL = byProduct.get(p.id) ?? [];
          let routeSet = false;
          for (const l of listL) {
            if (l.qte <= 0) continue;
            if (l.product_packaging_id && packIds.has(l.product_packaging_id)) {
              nextQ[pKey(p.id, l.product_packaging_id)] = l.qte;
              if (!routeSet) {
                nextRoute[p.id] = l.product_packaging_id;
                routeSet = true;
              }
            } else if (!l.product_packaging_id) {
              nextQ[uKey(p.id)] = l.qte;
              if (!routeSet) {
                nextRoute[p.id] = "unit";
                routeSet = true;
              }
            } else if (!routeSet) {
              nextRoute[p.id] = preferredPackRoute(packs, sid);
            }
          }
          if (!routeSet) {
            nextRoute[p.id] = preferredPackRoute(packs, sid);
          }
        }
        setPackRoute(nextRoute);
        setQtes(nextQ);
        setIndex(0);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    })();
  }, [commandeId, router, pKey, uKey]);

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
      throw new Error(j.error ?? "Sauvegarde impossible");
    }
  }, [buildLignesPayload, commandeId]);

  const onTerminer = useCallback(async () => {
    setErr(null);
    setSaving(true);
    try {
      await sendLignes();
      void router.push(`/commandes-fournisseur/saisie/${commandeId}/recap`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [sendLignes, router, commandeId]);

  const isLast = index >= n - 1;
  const posLabel = n > 0 ? `${index + 1} / ${n}` : "0 / 0";

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
    return <p className="px-4 py-4 text-slate-600">Chargement du parcours…</p>;
  }

  if (err) {
    return (
      <main className="px-4 py-4">
        <Typography color="error">{err}</Typography>
        <Button component={AppLink} href={`/commandes-fournisseur/saisie/${commandeId}/recap`} className="!mt-4">
          Revenir au récap
        </Button>
      </main>
    );
  }

  if (!current || n === 0) {
    return (
      <main className="px-4 py-4">
        <Typography>Aucun produit actif pour ce fournisseur.</Typography>
        <Button component={AppLink} href={`/commandes-fournisseur/saisie/${commandeId}/recap`} className="!mt-4" variant="contained">
          Revenir au récap
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-md flex-col px-3 py-3">
      <div className="relative !mb-2 flex min-h-[36px] shrink-0 items-center">
        <Button
          component={AppLink}
          href={`/commandes-fournisseur/saisie/${commandeId}/recap`}
          size="small"
          color="inherit"
          startIcon={<ChevronLeftIcon fontSize="small" />}
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
          Récapitulatif
        </Button>
        <Typography
          variant="body2"
          component="p"
          className="w-full text-center tabular-nums !text-[0.9375rem] sm:!text-base"
          sx={{ fontWeight: 600 }}
        >
          {posLabel}
        </Typography>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
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

        <div className="flex min-h-[min(17rem,42dvh)] flex-1 flex-col gap-3 pb-2">
          {currentBlocks}
        </div>
      </div>

      <Box
        className="mt-8 flex shrink-0 flex-col gap-4 pt-5"
        sx={{ borderTop: 1, borderColor: "divider" }}
      >
        <div className="flex min-h-[2.75rem] flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="outlined"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index <= 0}
            startIcon={<ChevronLeftIcon />}
            sx={{ textTransform: "none", minHeight: 40 }}
          >
            Précédent
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
            Suivant
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
          {saving ? "…" : "Terminer"}
        </Button>
      </Box>
    </main>
  );
}
