"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box, Button, Chip, Typography } from "@mui/material";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { productPhotoPublicUrl } from "@/lib/products/storage";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import { formatShopPriceDh } from "@/lib/shop/format-price";
import {
  getProductCartLine,
  readCartFromStorage,
  removeProductFromCart,
  upsertCartLine,
  writeCartToStorage,
} from "@/lib/shop/cart-storage";
import {
  readFulfillmentFromStorage,
  writeFulfillmentToStorage,
} from "@/lib/shop/fulfillment-storage";
import {
  clearOrderCommentStorage,
  readOrderCommentFromStorage,
  writeOrderCommentToStorage,
} from "@/lib/shop/order-comment-storage";
import { addQtyByStep, subtractQtyByStep } from "@/lib/shop/cart-qty";
import {
  convertCanonicalKgToQty,
  convertLineQtyToOption,
  resolveLineCanonicalKg,
} from "@/lib/shop/shop-qty-convert";
import {
  favoriteShopOrderUnitId,
  findShopOption,
} from "@/lib/shop/shop-order-options";
import {
  clearPaymentStorage,
  readPaymentFromStorage,
  writePaymentToStorage,
} from "@/lib/shop/payment-storage";
import type { ShopPaymentMethod } from "@/lib/shop/payment-types";
import type { ShopCartLine, ShopCategoryGroup, ShopProduct } from "@/lib/shop/types";
import ShopShell from "@/app/shop/ShopShell";
import ShopProductCard from "@/app/shop/ShopProductCard";
import ShopCartPanel, { buildCartLineFromProduct } from "@/app/shop/ShopCartPanel";
import ShopFulfillmentSelector from "@/app/shop/ShopFulfillmentSelector";
import ShopPaymentSelector from "@/app/shop/ShopPaymentSelector";
import { useShopAnalytics } from "@/lib/shop/useShopAnalytics";
import type { ShopFulfillmentMode } from "@/lib/shop/livraison-types";
import { ARABIC_FONT_FAMILY } from "@/lib/fonts/noto-sans-arabic";
import { shopSloganScript } from "@/lib/fonts/shop-slogan-script";

type Props = {
  initialGroups: ShopCategoryGroup[];
  catalogError: string | null;
  pickupMagasinName: string | null;
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

function getDisplayedProductQty(
  lines: ShopCartLine[],
  product: ShopProduct,
  selectedUnitId: string | null,
): number {
  const line = getProductCartLine(lines, product.id);
  if (!line) return 0;
  if (line.shopOrderUnitId === selectedUnitId) return line.qty;
  const option = findShopOption(product, selectedUnitId);
  if (!option) return 0;
  return convertLineQtyToOption(line, product, option);
}

export default function ShopOrderClient({
  initialGroups,
  catalogError,
  pickupMagasinName,
}: Props) {
  const t = useTranslations("shop");
  const locale = useAppLocale();
  const [groups] = useState(initialGroups);
  const [lines, setLines] = useState<ShopCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<ShopFulfillmentMode | null>(null);
  const [orderComment, setOrderComment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ShopPaymentMethod | null>(null);
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
    const cart = readCartFromStorage();
    setLines(cart.lines);
    const unitFromCart: Record<string, string | null> = {};
    for (const line of cart.lines) {
      unitFromCart[line.productId] = line.shopOrderUnitId;
    }
    setSelectedUnitByProduct(unitFromCart);
    setFulfillmentMode(readFulfillmentFromStorage().mode);
    setOrderComment(readOrderCommentFromStorage());
    setPaymentMethod(readPaymentFromStorage().method);
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

  const setOrderCommentPersisted = useCallback((comment: string) => {
    setOrderComment(comment);
    writeOrderCommentToStorage(comment);
  }, []);

  const setPaymentMethodPersisted = useCallback((method: ShopPaymentMethod) => {
    setPaymentMethod(method);
    writePaymentToStorage({ method });
  }, []);

  const setMode = useCallback((mode: ShopFulfillmentMode) => {
    setFulfillmentMode(mode);
    writeFulfillmentToStorage({ mode });
  }, []);

  useShopAnalytics({ lines, hydrated });

  const fulfillmentLabel = useMemo(() => {
    if (fulfillmentMode === "pickup") {
      return pickupMagasinName?.trim()
        ? t("fulfillment.orderPickupNamed", { name: pickupMagasinName.trim() })
        : t("fulfillment.orderPickup");
    }
    if (fulfillmentMode === "home") return t("fulfillment.orderHome");
    return null;
  }, [fulfillmentMode, pickupMagasinName, t]);

  const paymentLabel = useMemo(() => {
    if (paymentMethod === "cash") return t("payment.orderCash");
    if (paymentMethod === "card") return t("payment.orderCard");
    return null;
  }, [paymentMethod, t]);

  const getSelectedUnitId = useCallback(
    (product: ShopProduct): string | null => {
      if (Object.prototype.hasOwnProperty.call(selectedUnitByProduct, product.id)) {
        return selectedUnitByProduct[product.id] ?? null;
      }
      return favoriteShopOrderUnitId(product);
    },
    [selectedUnitByProduct],
  );

  const selectProductUnit = useCallback(
    (product: ShopProduct, newUnitId: string | null) => {
      setSelectedUnitByProduct((prev) => ({ ...prev, [product.id]: newUnitId }));
      setLines((prev) => {
        const existing = getProductCartLine(prev, product.id);
        if (!existing || existing.shopOrderUnitId === newUnitId) return prev;

        const option = findShopOption(product, newUnitId);
        const without = removeProductFromCart(prev, product.id);
        if (!option) return without;

        const canonicalKg = resolveLineCanonicalKg(existing, product);
        const newQty = convertCanonicalKgToQty(canonicalKg, option);
        if (newQty <= 0) return without;

        const line = buildCartLineFromProduct(product, newUnitId, newQty, locale, canonicalKg);
        return upsertCartLine(without, line);
      });
    },
    [locale],
  );

  const updateLine = useCallback(
    (productId: string, shopOrderUnitId: string | null, qty: number) => {
      const product = productById.get(productId);
      if (!product) return;
      setLines((prev) => {
        const without = removeProductFromCart(prev, productId);
        const line = buildCartLineFromProduct(product, shopOrderUnitId, qty, locale);
        const next = upsertCartLine(without, line);
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
        const existing = getProductCartLine(prev, product.id);
        const without = removeProductFromCart(prev, product.id);
        let current = 0;
        if (existing) {
          current =
            existing.shopOrderUnitId === unitId
              ? existing.qty
              : convertLineQtyToOption(existing, product, option);
        }
        const nextQty = current > 0 ? addQtyByStep(current, option.qtyStep) : option.qtyStep;
        const line = buildCartLineFromProduct(product, unitId, nextQty, locale);
        return upsertCartLine(without, line);
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
        const existing = getProductCartLine(prev, product.id);
        if (!existing) return prev;

        const without = removeProductFromCart(prev, product.id);
        const current =
          existing.shopOrderUnitId === unitId
            ? existing.qty
            : convertLineQtyToOption(existing, product, option);
        const nextQty = subtractQtyByStep(current, option.qtyStep);
        if (nextQty <= 0) {
          if (without.length === 0) {
            setCartOpen(false);
          }
          return without;
        }
        const line = buildCartLineFromProduct(product, unitId, nextQty, locale);
        return upsertCartLine(without, line);
      });
    },
    [getSelectedUnitId, locale],
  );

  const cartCount = lines.length;
  const cartTotal = lines.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0);

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
            <Typography
              component="p"
              className={locale === "ar-MA" ? undefined : shopSloganScript.className}
              sx={{
                display: "block",
                textAlign: "center",
                color: "success.dark",
                fontFamily: locale === "ar-MA" ? ARABIC_FONT_FAMILY : shopSloganScript.style.fontFamily,
                fontSize: { xs: "1.4rem", sm: "1.55rem" },
                fontWeight: 600,
                lineHeight: 1.35,
                letterSpacing: 0.02,
                textTransform: "none",
                mb: 0.25,
              }}
            >
              {t("slogan")}
            </Typography>
            <Typography variant="h5" color="success.dark" sx={{ fontWeight: 800, mt: 0.5 }}>
              {t("title")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("subtitle")}
            </Typography>
            <ShopFulfillmentSelector
              mode={fulfillmentMode}
              onChange={setMode}
              pickupMagasinName={pickupMagasinName}
            />
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
                          xs: "repeat(2, minmax(0, 1fr))",
                          sm: "repeat(3, minmax(0, 1fr))",
                          md: "repeat(4, minmax(0, 1fr))",
                        },
                        gap: { xs: 1.25, sm: 1.5 },
                      }}
                    >
                      {subgroup.products.map((product) => {
                        const unitId = getSelectedUnitId(product);
                        const qty = getDisplayedProductQty(lines, product, unitId);
                        const photoUrl = productPhotoPublicUrl(supabase, product.image_path);
                        return (
                          <ShopProductCard
                            key={product.id}
                            product={product}
                            photoUrl={photoUrl}
                            qty={qty}
                            selectedShopOrderUnitId={unitId}
                            onSelectUnit={(id) => selectProductUnit(product, id)}
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
            maxWidth: 480,
            mx: "auto",
          }}
        >
          <Button
            variant="contained"
            color="success"
            onClick={() => setCartOpen(true)}
            startIcon={<ShoppingCartOutlinedIcon />}
            fullWidth
            sx={{
              textTransform: "none",
              fontWeight: 700,
              py: 1.25,
            }}
          >
            {t("viewMyCart")} · {t("cartProductCount", { count: cartCount })} ·{" "}
            {formatShopPriceDh(locale, cartTotal, true)}
          </Button>
        </Box>
      ) : null}

      <ShopCartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={lines}
        productById={productById}
        categoryGroups={groups}
        fulfillmentLabel={fulfillmentLabel}
        paymentMethod={paymentMethod}
        onPaymentChange={setPaymentMethodPersisted}
        paymentLabel={paymentLabel}
        orderComment={orderComment}
        onOrderCommentChange={setOrderCommentPersisted}
        onUpdateLine={updateLine}
        onClear={() => {
          setLines([]);
          setOrderComment("");
          clearOrderCommentStorage();
          setPaymentMethod(null);
          clearPaymentStorage();
          setCartOpen(false);
        }}
      />
    </>
  );
}
