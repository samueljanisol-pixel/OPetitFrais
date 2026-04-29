"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button, Typography } from "@mui/material";
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

  const selectRoute = useCallback(
    (p: Product, route: PackRoute) => {
      setPackRoute((prev) => ({ ...prev, [p.id]: route }));
      setQtes((prev) => {
        const next = { ...prev };
        delete next[uKey(p.id)];
        for (const pkg of packArray(p.product_packaging)) {
          delete next[pKey(p.id, pkg.id)];
        }
        return next;
      });
    },
    [pKey, uKey],
  );

  /** Une seule quantité par produit : soit unité, soit un conditionnement. */
  const setQForKey = useCallback(
    (p: Product, key: string, v: number) => {
      setQtes((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k === uKey(p.id) || (k.startsWith("p:") && k.split(":")[1] === p.id)) {
            delete next[k];
          }
        }
        if (v > 0) {
          next[key] = v;
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
          commande?: { status?: string; supplier_id?: string };
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
        const r2 = await fetch(
          `/api/commandes-fournisseur/parcours-produits?supplierId=${encodeURIComponent(sid)}`,
          { credentials: "include" },
        );
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
          const listL = byProduct.get(p.id) ?? [];
          const withQty = listL.find((l) => l.qte > 0) ?? null;
          if (withQty) {
            if (withQty.product_packaging_id) {
              nextRoute[p.id] = withQty.product_packaging_id;
              nextQ[pKey(p.id, withQty.product_packaging_id)] = withQty.qte;
            } else {
              nextRoute[p.id] = "unit";
              nextQ[uKey(p.id)] = withQty.qte;
            }
          } else {
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
      const route = getRoute(p);
      if (route === "unit") {
        const uq = getQ(uKey(p.id));
        if (uq > 0) {
          out.push({ productId: p.id, productPackagingId: null, qte: uq, horsFournisseur: false });
        }
      } else {
        const q = getQ(pKey(p.id, route));
        if (q > 0) {
          out.push({ productId: p.id, productPackagingId: route, qte: q, horsFournisseur: false });
        }
      }
    }
    return out;
  }, [getQ, getRoute, pKey, products, uKey]);

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
    <main className="mx-auto w-full max-w-md px-3 py-3">
      <div className="relative !mb-2 flex min-h-[36px] items-center">
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

      <div className="!mb-4 flex flex-col gap-3">{currentBlocks}</div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="outlined"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index <= 0}
            startIcon={<ChevronLeftIcon />}
            sx={{ textTransform: "none" }}
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
            sx={{ textTransform: "none" }}
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
          sx={{ textTransform: "none" }}
        >
          {saving ? "…" : "Terminer"}
        </Button>
      </div>
    </main>
  );
}
