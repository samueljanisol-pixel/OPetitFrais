"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box, Button, Chip, Typography } from "@mui/material";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { productPhotoPublicUrl } from "@/lib/products/storage";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import { formatShopPriceDh } from "@/lib/shop/format-price";
import { buildOrderText, buildWhatsAppUrl } from "@/lib/shop/format-order-text";
import { buildCategoryMeta } from "@/lib/shop/group-cart-by-category";
import { getShopWhatsAppPhone, isShopWhatsAppConfigured } from "@/lib/shop/whatsapp-phone";
import {
  getCartLineQty,
  readCartFromStorage,
  upsertCartLine,
  writeCartToStorage,
} from "@/lib/shop/cart-storage";
import { addQtyByStep, subtractQtyByStep } from "@/lib/shop/cart-qty";
import {
  favoriteShopOrderUnitId,
  findShopOption,
} from "@/lib/shop/shop-order-options";
import type { ShopCartLine, ShopCategoryGroup, ShopProduct } from "@/lib/shop/types";
import ShopShell from "@/app/shop/ShopShell";
import ShopProductCard from "@/app/shop/ShopProductCard";
import ShopCartPanel, { buildCartLineFromProduct } from "@/app/shop/ShopCartPanel";
import { useShopAnalytics } from "@/lib/shop/useShopAnalytics";

type Props = {
  initialGroups: ShopCategoryGroup[];
  catalogError: string | null;
};

function flattenProducts(groups: ShopCategoryGroup[]): ShopProduct[] {
  const products: ShopProduct[] = [];
  for (const group of groups) {
    for (const subgroup of group.subgroups) {
      products.push(...subgroup.products);
    }
  }
  return products;
}

export default function ShopOrderClient({ initialGroups, catalogError }: Props) {
  const t = useTranslations("shop");
  const locale = useAppLocale();
  const [groups] = useState(initialGroups);
  const [lines, setLines] = useState<ShopCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    initialGroups[0]?.categoryId ?? null,
  );
  const [hydrated, setHydrated] = useState(false);
  const [selectedUnitByProduct, setSelectedUnitByProduct] = useState<Record<string, string | null>>(
    {},
  );
  const skipNextWriteRef = useRef(true);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const productById = useMemo(() => {
    const map = new Map<string, ShopProduct>();
    for (const p of flattenProducts(groups)) {
      map.set(p.id, p);
    }
    return map;
  }, [groups]);

  useLayoutEffect(() => {
    setLines(readCartFromStorage().lines);
    setHydrated(true);
    skipNextWriteRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    writeCartToStorage({ lines });
  }, [lines, hydrated]);

  useShopAnalytics({ lines, hydrated });

  const getSelectedUnitId = useCallback(
    (product: ShopProduct): string | null => {
      if (Object.prototype.hasOwnProperty.call(selectedUnitByProduct, product.id)) {
        return selectedUnitByProduct[product.id] ?? null;
      }
      return favoriteShopOrderUnitId(product);
    },
    [selectedUnitByProduct],
  );

  const updateLine = useCallback(
    (productId: string, shopOrderUnitId: string | null, qty: number) => {
      const product = productById.get(productId);
      if (!product) return;
      setLines((prev) => {
        const line = buildCartLineFromProduct(product, shopOrderUnitId, qty, locale);
        const next = upsertCartLine(prev, line);
        if (qty <= 0 && next.length === 0) {
          setCartOpen(false);
        }
        return next;
      });
    },
    [productById, locale],
  );

  const addProduct = useCallback(
    (product: ShopProduct) => {
      const unitId = getSelectedUnitId(product);
      const option = findShopOption(product, unitId);
      if (!option) return;
      setLines((prev) => {
        const current = getCartLineQty(prev, product.id, unitId);
        const nextQty = current > 0 ? addQtyByStep(current, option.qtyStep) : option.qtyStep;
        const line = buildCartLineFromProduct(product, unitId, nextQty, locale);
        return upsertCartLine(prev, line);
      });
    },
    [getSelectedUnitId, locale],
  );

  const removeProduct = useCallback(
    (product: ShopProduct) => {
      const unitId = getSelectedUnitId(product);
      const option = findShopOption(product, unitId);
      if (!option) return;
      setLines((prev) => {
        const current = getCartLineQty(prev, product.id, unitId);
        const nextQty = subtractQtyByStep(current, option.qtyStep);
        const line = buildCartLineFromProduct(product, unitId, nextQty, locale);
        const next = upsertCartLine(prev, line);
        if (next.length === 0) {
          setCartOpen(false);
        }
        return next;
      });
    },
    [getSelectedUnitId, locale],
  );

  const cartCount = lines.length;
  const cartTotal = lines.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0);

  const categoryMeta = useMemo(() => buildCategoryMeta(groups), [groups]);

  const orderText = useMemo(
    () =>
      buildOrderText(
        lines,
        productById,
        locale,
        {
          title: t("orderTitle"),
          total: t("estimatedTotal"),
          separator: "──────────────────────",
          uncategorized: t("uncategorized"),
        },
        categoryMeta,
      ),
    [lines, productById, locale, t, categoryMeta],
  );

  const whatsAppHref = useMemo(() => {
    if (!isShopWhatsAppConfigured() || lines.length === 0) return null;
    return buildWhatsAppUrl(getShopWhatsAppPhone(), orderText);
  }, [lines.length, orderText]);

  const activeGroup = groups.find((g) => g.categoryId === activeCategoryId) ?? groups[0] ?? null;

  if (catalogError) {
    return (
      <ShopShell cartCount={0} cartTotal={0} onOpenCart={() => setCartOpen(true)}>
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <Typography color="error">{catalogError}</Typography>
        </main>
      </ShopShell>
    );
  }

  return (
    <>
      <ShopShell cartCount={cartCount} cartTotal={cartTotal} onOpenCart={() => setCartOpen(true)}>
        <main className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-emerald-50/80 to-white pb-28">
          <Box sx={{ px: 2, pt: 2, pb: 1 }}>
            <Typography variant="h5" color="success.dark" sx={{ fontWeight: 800 }}>
              {t("title")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("subtitle")}
            </Typography>
          </Box>

          {groups.length === 0 ? (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 4 }}>
              <Typography color="text.secondary">{t("noProducts")}</Typography>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  overflowX: "auto",
                  px: 2,
                  py: 1.5,
                  position: "sticky",
                  top: 56,
                  zIndex: 20,
                  bgcolor: "rgba(255,255,255,0.92)",
                  backdropFilter: "blur(8px)",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                {groups.map((group) => (
                  <Chip
                    key={group.categoryId}
                    label={group.categoryLabel}
                    color={group.categoryId === activeGroup?.categoryId ? "success" : "default"}
                    variant={group.categoryId === activeGroup?.categoryId ? "filled" : "outlined"}
                    onClick={() => setActiveCategoryId(group.categoryId)}
                    sx={{ flexShrink: 0 }}
                  />
                ))}
              </Box>

              <Box sx={{ px: 2, py: 2, display: "flex", flexDirection: "column", gap: 3 }}>
                {activeGroup?.subgroups.map((subgroup) => (
                  <Box key={`${activeGroup.categoryId}-${subgroup.subcategoryId ?? "none"}`}>
                    <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>
                      {subgroup.subcategoryLabel}
                    </Typography>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "repeat(3, minmax(0, 1fr))",
                          sm: "repeat(4, minmax(0, 1fr))",
                          md: "repeat(5, minmax(0, 1fr))",
                        },
                        gap: 1,
                      }}
                    >
                      {subgroup.products.map((product) => {
                        const unitId = getSelectedUnitId(product);
                        const qty = getCartLineQty(lines, product.id, unitId);
                        const photoUrl = productPhotoPublicUrl(supabase, product.image_path);
                        return (
                          <ShopProductCard
                            key={product.id}
                            product={product}
                            photoUrl={photoUrl}
                            qty={qty}
                            selectedShopOrderUnitId={unitId}
                            onSelectUnit={(id) =>
                              setSelectedUnitByProduct((prev) => ({ ...prev, [product.id]: id }))
                            }
                            onAdd={() => addProduct(product)}
                            onRemove={() => removeProduct(product)}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </main>
      </ShopShell>

      {cartCount > 0 ? (
        <Box
          sx={{
            position: "fixed",
            bottom: 16,
            left: 16,
            right: 16,
            zIndex: 25,
            display: "flex",
            gap: 1,
            maxWidth: 480,
            mx: "auto",
          }}
        >
          <Button
            variant="outlined"
            color="success"
            onClick={() => setCartOpen(true)}
            startIcon={<ShoppingCartOutlinedIcon />}
            sx={{
              flex: whatsAppHref ? "0 1 auto" : 1,
              textTransform: "none",
              fontWeight: 700,
              bgcolor: "background.paper",
              whiteSpace: "nowrap",
            }}
          >
            {formatShopPriceDh(locale, cartTotal, true)}
          </Button>
          {whatsAppHref ? (
            <Button
              variant="contained"
              color="success"
              component="a"
              href={whatsAppHref}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<WhatsAppIcon />}
              sx={{ flex: 1, textTransform: "none", fontWeight: 700 }}
            >
              {t("sendWhatsApp")}
            </Button>
          ) : null}
        </Box>
      ) : null}

      <ShopCartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={lines}
        productById={productById}
        categoryGroups={groups}
        onUpdateLine={updateLine}
        onClear={() => {
          setLines([]);
          setCartOpen(false);
        }}
      />
    </>
  );
}
