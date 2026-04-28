"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AppLink from "@/components/AppLink";

type PPack = {
  id: string;
  conditionnement_id: string;
  quantity: string | number;
  ref_conditionnement?: unknown;
  ref_sales_unit?: unknown;
};
type Product = {
  id: string;
  name: string;
  code: string;
  ref_category: unknown;
  ref_sales_unit?: unknown;
  product_packaging: PPack[] | PPack | null;
};

type PackRoute = "unit" | string;

function refLabel(raw: unknown): string {
  const o = (Array.isArray(raw) ? raw[0] : raw) as { label?: string } | null | undefined;
  return o?.label?.trim() ? String(o.label) : "—";
}

function formatQtyDisplay(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

function packQtyValue(pkg: PPack): number {
  return typeof pkg.quantity === "string" ? parseFloat(pkg.quantity) : Number(pkg.quantity);
}

function parseCategoryLabel(raw: unknown): string {
  const c = (Array.isArray(raw) ? raw[0] : raw) as { label?: string } | null | undefined;
  return c?.label?.trim() ? String(c.label) : "—";
}

function packArray(p: Product["product_packaging"]): PPack[] {
  if (!p) return [];
  return Array.isArray(p) ? p : [p];
}

function UnitQteControl({
  unitLabel,
  value,
  onChange,
}: {
  unitLabel: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const step = (d: number) => () => onChange(Math.max(0, value + d));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <div className="flex gap-0.5">
          <Button size="small" variant="outlined" onClick={step(-10)} disabled={value < 10}>
            -10
          </Button>
          <Button size="small" variant="outlined" onClick={step(-1)} disabled={value < 1}>
            -1
          </Button>
        </div>
        <div className="flex min-w-0 items-baseline justify-center gap-1">
          <Typography variant="h6" className="shrink-0 text-center">
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" className="shrink-0">
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

function PackQteControl({
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
  const step = (d: number) => () => onChange(Math.max(0, value + d));
  return (
    <div className="flex flex-col gap-1">
      <Typography variant="body2" className="!font-medium leading-snug" component="p">
        {condWithPackSpec}
      </Typography>
      <div className="flex items-center justify-between gap-1">
        <div className="flex gap-0.5">
          <Button size="small" variant="outlined" onClick={step(-10)} disabled={value < 10}>
            -10
          </Button>
          <Button size="small" variant="outlined" onClick={step(-1)} disabled={value < 1}>
            -1
          </Button>
        </div>
        <Typography variant="h6" className="min-w-[2.5rem] shrink-0 text-center">
          {value}
        </Typography>
        <div className="flex gap-0.5">
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

type LigneIn = { product_id: string; product_packaging_id: string | null; qte: number };

export default function ParcoursClient({ commandeId }: { commandeId: string }) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [qtes, setQtes] = useState<Record<string, number>>({});
  const [packRoute, setPackRoute] = useState<Record<string, PackRoute>>({});
  const [saving, setSaving] = useState(false);

  const n = products.length;
  const current = n > 0 && index < n ? products[index] : null;

  const uKey = useCallback((pid: string) => `u:${pid}`, []);
  const pKey = useCallback((pid: string, pk: string) => `p:${pid}:${pk}`, []);

  const getQ = useCallback(
    (k: string) => qtes[k] ?? 0,
    [qtes],
  );

  const getRoute = useCallback(
    (product: Product): PackRoute => {
      const pr = packRoute[product.id];
      if (pr !== undefined) return pr;
      const packs = packArray(product.product_packaging);
      return packs.length > 0 ? packs[0]!.id : "unit";
    },
    [packRoute],
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
            nextRoute[p.id] = packs.length > 0 ? packs[0]!.id : "unit";
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
  }, [commandeId, router]);

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
    const packs = packArray(p.product_packaging);
    const productUnit = refLabel(p.ref_sales_unit);
    const route = getRoute(p);

    if (packs.length === 0) {
      return (
        <UnitQteControl
          unitLabel={productUnit}
          value={getQ(uKey(p.id))}
          onChange={(v) => setQForKey(p, uKey(p.id), v)}
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
            onClick={() => selectRoute(p, "unit")}
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
                onClick={() => selectRoute(p, pkg.id)}
                sx={{ textTransform: "none" }}
              >
                {shortT} {spec}
              </Button>
            );
          })}
        </div>
        {route === "unit" ? (
          <UnitQteControl
            unitLabel={productUnit}
            value={getQ(uKey(p.id))}
            onChange={(v) => setQForKey(p, uKey(p.id), v)}
          />
        ) : (() => {
          const pkg = packs.find((x) => x.id === route);
          if (!pkg) return null;
          const cond = refLabel(pkg.ref_conditionnement);
          const condName = cond !== "—" ? cond : "Colis";
          const pq = packQtyValue(pkg);
          const pkUnit = refLabel(pkg.ref_sales_unit);
          const v = getQ(pKey(p.id, pkg.id));
          const total = v * pq;
          const productUnitL = productUnit;
          const condWithPackSpec = `${condName} (${formatQtyDisplay(pq)} ${pkUnit})`;
          const soitLine = v > 0 ? `Soit ${formatQtyDisplay(total)} ${productUnitL}` : null;
          return (
            <PackQteControl
              condWithPackSpec={condWithPackSpec}
              soitLine={soitLine}
              value={v}
              onChange={(n) => setQForKey(p, pKey(p.id, pkg.id), n)}
            />
          );
        })()}
      </div>
    );
  }, [current, getQ, getRoute, packRoute, pKey, selectRoute, setQForKey, uKey]);

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
      <div className="!mb-2 flex flex-row items-center justify-between">
        <Button component={AppLink} href={`/commandes-fournisseur/saisie/${commandeId}/recap`} size="small" color="inherit" sx={{ textTransform: "none" }}>
          Récap
        </Button>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {posLabel}
        </Typography>
        <span className="w-16" />
      </div>

      <Typography variant="caption" color="text.secondary" className="!mb-0.5 block">
        {catLabel}
      </Typography>
      <Typography variant="h6" component="h1" className="!mb-3 !text-base" sx={{ fontWeight: 600 }}>
        {current.name}
      </Typography>

      <div className="!mb-4 flex flex-col gap-3">{currentBlocks}</div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="outlined"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index <= 0}
            startIcon={<ChevronLeftIcon />}
          >
            Préc.
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
