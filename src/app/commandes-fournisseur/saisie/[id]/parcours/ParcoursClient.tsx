"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CommentOutlinedIcon from "@mui/icons-material/CommentOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AppLink from "@/components/AppLink";
import LigneSaisieComments from "@/components/commandes-fournisseur/LigneSaisieComments";
import ProductArabicSubtitle from "@/components/ProductArabicSubtitle";
import FormDialog from "@/lib/mui/FormDialog";
import {
  type PackRoute,
  type ParcoursProductForQty,
  ParcoursProductQuantityPanel,
  packArray,
  preferredPackRoute,
  pKeyForProduct,
  uKeyForProduct,
  buildParcoursCategoryNav,
  categoryKeyForProduct,
} from "@/features/commandes-fournisseur/parcours-product-quantity";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import {
  buildParcoursLineCommentsFromLignes,
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
  category_id?: string;
  ref_category: unknown;
  photoUrl?: string | null;
};

type LigneIn = {
  product_id: string;
  product_packaging_id: string | null;
  qte: number;
  line_comment?: string | null;
};

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
  const [lineComments, setLineComments] = useState<Record<string, string>>({});
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commandeSupplierId, setCommandeSupplierId] = useState<string | null>(null);
  const [commandeMagasinId, setCommandeMagasinId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshingProduct, setRefreshingProduct] = useState(false);
  const indexRef = useRef(0);
  const productsRef = useRef<Product[]>([]);
  const categoryChipRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
      lineComments,
      index: idx,
      focusProductId: pid,
    });
  }, [commandeId, lineComments, packRoute, qtes]);

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
        const fromDbComments = buildParcoursLineCommentsFromLignes(j1.lignes ?? []);
        const draft = loadParcoursDraft(commandeId);
        const mergedQ = { ...fromDb.qtes, ...(draft?.qtes ?? {}) };
        const mergedRoute = { ...fromDb.packRoute, ...(draft?.packRoute ?? {}) };
        const mergedComments = { ...fromDbComments, ...(draft?.lineComments ?? {}) };
        setQtes(mergedQ);
        setPackRoute(mergedRoute);
        setLineComments(mergedComments);

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
      lineComment: string | null;
      horsFournisseur: boolean;
    }[] = [];
    for (const p of products) {
      const rawComment = lineComments[p.id];
      const lineComment =
        typeof rawComment === "string" && rawComment.trim().length > 0 ? rawComment.trim() : null;
      const uq = clampQtyToApiRange(getQ(uKey(p.id)));
      if (uq > 0) {
        out.push({
          productId: p.id,
          productPackagingId: null,
          qte: uq,
          lineComment,
          horsFournisseur: false,
        });
      }
      for (const pkg of packArray(p.product_packaging)) {
        const q = clampQtyToApiRange(getQ(pKey(p.id, pkg.id)));
        if (q > 0) {
          out.push({
            productId: p.id,
            productPackagingId: pkg.id,
            qte: q,
            lineComment,
            horsFournisseur: false,
          });
        }
      }
    }
    return out;
  }, [getQ, lineComments, pKey, products, uKey]);

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

  const categoryNav = useMemo(() => buildParcoursCategoryNav(products), [products]);
  const currentCategoryKey = current ? categoryKeyForProduct(current) : "";
  const currentLineComment =
    current && typeof lineComments[current.id] === "string" ? lineComments[current.id]!.trim() : "";

  const openCommentDialog = useCallback(() => {
    if (!current) {
      return;
    }
    setCommentDraft(lineComments[current.id] ?? "");
    setCommentDialogOpen(true);
  }, [current, lineComments]);

  const closeCommentDialog = useCallback(() => {
    setCommentDialogOpen(false);
    setCommentDraft("");
  }, []);

  const saveProductComment = useCallback(() => {
    if (!current) {
      return;
    }
    const trimmed = commentDraft.trim();
    setLineComments((prev) => {
      const next = { ...prev };
      if (trimmed.length > 0) {
        next[current.id] = trimmed;
      } else {
        delete next[current.id];
      }
      return next;
    });
    closeCommentDialog();
  }, [closeCommentDialog, commentDraft, current]);

  const deleteProductComment = useCallback(() => {
    if (!current) {
      return;
    }
    setLineComments((prev) => {
      const next = { ...prev };
      delete next[current.id];
      return next;
    });
    closeCommentDialog();
  }, [closeCommentDialog, current]);

  useEffect(() => {
    if (!currentCategoryKey) {
      return;
    }
    categoryChipRefs.current.get(currentCategoryKey)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [currentCategoryKey, index]);

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

      {categoryNav.length > 0 ? (
        <Box
          component="nav"
          aria-label={t("categoryNavAria")}
          className="!mb-2 shrink-0"
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: 1,
            overflowX: "auto",
            pb: 0.5,
            mx: -0.5,
            px: 0.5,
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
          }}
        >
          {categoryNav.map((cat) => {
            const selected = cat.key === currentCategoryKey;
            return (
              <Box
                key={cat.key}
                ref={(el: HTMLDivElement | null) => {
                  if (el) {
                    categoryChipRefs.current.set(cat.key, el);
                  } else {
                    categoryChipRefs.current.delete(cat.key);
                  }
                }}
                sx={{ flexShrink: 0 }}
              >
                <Chip
                  label={cat.label}
                  size="medium"
                  clickable
                  color={selected ? "success" : "default"}
                  variant={selected ? "filled" : "outlined"}
                  onClick={() => setIndex(cat.startIndex)}
                  sx={{
                    fontWeight: selected ? 700 : 500,
                    fontSize: "0.9375rem",
                    height: 36,
                    "& .MuiChip-label": { px: 1.5 },
                  }}
                />
              </Box>
            );
          })}
        </Box>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
        <div className="mb-3 flex w-full justify-center">
          <div className="relative h-36 w-full max-w-[6rem] shrink-0">
            {typeof current.photoUrl === "string" && current.photoUrl.length > 0 ? (
              <Image
                src={current.photoUrl}
                alt=""
                fill
                className="object-contain object-center"
                sizes="(max-width: 448px) 100vw, 12rem"
              />
            ) : null}
          </div>
        </div>
        <Typography
          variant="h6"
          component="h1"
          className="!mb-1 text-center"
          sx={{ fontWeight: 600, fontSize: "1.125rem", lineHeight: 1.35 }}
        >
          {current.name}
        </Typography>
        <ProductArabicSubtitle
          nameAr={current.name_ar}
          centered
          underPrimaryTitle
          alwaysShow
          reserveSpace
          className="!mb-3"
        />

        <div className="flex flex-col gap-3 pb-2">
          {currentBlocks}
        </div>

        <div className="!mt-2 flex w-full flex-col items-center gap-1 pb-2">
          <Button
            type="button"
            size="small"
            color={currentLineComment.length > 0 ? "info" : "inherit"}
            startIcon={<CommentOutlinedIcon fontSize="small" />}
            onClick={openCommentDialog}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            {tc("comment")}
          </Button>
          {currentLineComment.length > 0 ? (
            <LigneSaisieComments comments={[]} lineComment={currentLineComment} variant="chip" />
          ) : null}
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

      <FormDialog open={commentDialogOpen} onClose={closeCommentDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>
          {commentDraft.trim().length > 0 || currentLineComment.length > 0
            ? tc("commentLine")
            : tc("addComment")}
        </DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" className="!mb-2 !font-semibold">
            {current.name}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            label={tc("comment")}
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            disabled={saving}
            placeholder={tc("commentPlaceholder")}
          />
        </DialogContent>
        <DialogActions
          className="!px-3 !pb-2"
          sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}
        >
          {currentLineComment.length > 0 ? (
            <Button
              type="button"
              color="error"
              disabled={saving}
              onClick={deleteProductComment}
              sx={{ textTransform: "none" }}
            >
              {tCommon("delete")}
            </Button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex gap-1">
            <Button
              type="button"
              color="inherit"
              onClick={closeCommentDialog}
              sx={{ textTransform: "none" }}
              disabled={saving}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="contained"
              disabled={saving}
              onClick={saveProductComment}
              sx={{ textTransform: "none" }}
            >
              {tCommon("save")}
            </Button>
          </div>
        </DialogActions>
      </FormDialog>
    </main>
  );
}
