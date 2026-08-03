"use client";

import Image from "next/image";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { buildOrderText, buildWhatsAppUrl } from "@/lib/shop/format-order-text";
import { getShopWhatsAppPhone, isShopWhatsAppConfigured } from "@/lib/shop/whatsapp-phone";
import { addQtyByStep, subtractQtyByStep } from "@/lib/shop/cart-qty";
import { productDisplayName } from "@/lib/products/product-display-name";
import {
  formatShopKgEstimate,
  formatShopPriceDh,
  formatShopQty,
  formatShopQtyWithUnitLabel,
} from "@/lib/shop/format-price";
import { findShopOption, shopOptionLabel } from "@/lib/shop/shop-order-options";
import { canonicalKgFromQty } from "@/lib/shop/shop-qty-convert";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { AppLocale } from "@/i18n/config";
import type { ShopCartLine, ShopCategoryGroup, ShopProduct } from "@/lib/shop/types";
import { buildCategoryMeta, groupCartLinesByCategory } from "@/lib/shop/group-cart-by-category";
import { cartLineKey } from "@/lib/shop/cart-storage";
import ShopPaymentSelector from "@/app/shop/ShopPaymentSelector";
import ShopFulfillmentSelector from "@/app/shop/ShopFulfillmentSelector";
import ShopLineCommentBubble from "@/app/shop/ShopLineCommentBubble";
import type { ShopPaymentMethod } from "@/lib/shop/payment-types";
import type { ShopFulfillmentMode } from "@/lib/shop/livraison-types";

type Props = {
  open: boolean;
  onClose: () => void;
  cartNumber: number | null;
  lines: ShopCartLine[];
  productById: Map<string, ShopProduct>;
  productPhotoUrlById: Map<string, string | null>;
  categoryGroups: ShopCategoryGroup[];
  fulfillmentMode: ShopFulfillmentMode | null;
  onFulfillmentChange: (mode: ShopFulfillmentMode) => void;
  pickupMagasinName: string | null;
  fulfillmentLabel?: string | null;
  paymentMethod: ShopPaymentMethod | null;
  onPaymentChange: (method: ShopPaymentMethod) => void;
  paymentLabel?: string | null;
  orderComment: string;
  onOrderCommentChange: (comment: string) => void;
  onOpenLineComment: (productId: string, shopOrderUnitId: string | null) => void;
  onUpdateLine: (productId: string, shopOrderUnitId: string | null, qty: number) => void;
  onClear: () => void;
  onSubmitOrder?: () => void | Promise<void>;
};

export default function ShopCartPanel({
  open,
  onClose,
  cartNumber,
  lines,
  productById,
  productPhotoUrlById,
  categoryGroups,
  fulfillmentMode,
  onFulfillmentChange,
  pickupMagasinName,
  fulfillmentLabel = null,
  paymentMethod,
  onPaymentChange,
  paymentLabel = null,
  orderComment,
  onOrderCommentChange,
  onOpenLineComment,
  onUpdateLine,
  onClear,
  onSubmitOrder,
}: Props) {
  const t = useTranslations("shop");
  const locale = useAppLocale();
  const [snack, setSnack] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const categoryMeta = useMemo(() => buildCategoryMeta(categoryGroups), [categoryGroups]);

  const groupedLines = useMemo(
    () => groupCartLinesByCategory(lines, productById, categoryMeta, t("uncategorized"), locale),
    [lines, productById, categoryMeta, t, locale],
  );

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0),
    [lines],
  );

  const canExport = fulfillmentMode != null && paymentMethod != null;

  const orderText = useMemo(
    () =>
      buildOrderText(
        lines,
        productById,
        locale,
        {
          title: t("orderTitle"),
          cartNumber:
            cartNumber != null ? t("cartNumberLabel", { number: cartNumber }) : null,
          total: t("estimatedTotal"),
          separator: "──────────────────────",
          uncategorized: t("uncategorized"),
          fulfillment: fulfillmentLabel,
          payment: paymentLabel,
          commentLabel: t("orderCommentLabel"),
          comment: orderComment,
          lineCommentLabel: t("lineCommentLabel"),
        },
        categoryMeta,
      ),
    [
      lines,
      productById,
      locale,
      t,
      categoryMeta,
      cartNumber,
      fulfillmentLabel,
      paymentLabel,
      orderComment,
    ],
  );

  const whatsAppPhone = getShopWhatsAppPhone();
  const whatsAppHref =
    canExport && isShopWhatsAppConfigured()
      ? buildWhatsAppUrl(whatsAppPhone, orderText)
      : null;

  const copyList = async () => {
    if (!canExport) {
      setSnack(t("exportRequirements"));
      return;
    }
    try {
      await onSubmitOrder?.();
      await navigator.clipboard.writeText(orderText);
      setSnack(t("copied"));
    } catch {
      setSnack(t("copyFailed"));
    }
  };

  const openWhatsApp = async () => {
    if (!canExport) {
      setSnack(t("exportRequirements"));
      return;
    }
    if (!whatsAppHref) {
      setSnack(t("exportRequirements"));
      return;
    }
    await onSubmitOrder?.();
    window.open(whatsAppHref, "_blank", "noopener,noreferrer");
  };

  const formatLineQty = (line: ShopCartLine) => formatShopQty(locale, line.qty, line.unitCode);

  const handleClearConfirm = useCallback(() => {
    setClearConfirmOpen(false);
    onClear();
  }, [onClear]);

  return (
    <>
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        slotProps={{ paper: { sx: { maxHeight: "85vh" } } }}
      >
        <Box sx={{ p: 2, pb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
              {t("cart")}
              {cartNumber != null ? (
                <Typography
                  component="span"
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 1, fontWeight: 600 }}
                >
                  #{cartNumber}
                </Typography>
              ) : null}
            </Typography>
            <IconButton aria-label={t("close")} onClick={onClose} edge="end">
              <CloseIcon />
            </IconButton>
          </Box>

          {lines.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
              {t("emptyCart")}
            </Typography>
          ) : (
            <>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {groupedLines.map((group) => (
                  <Box key={group.categoryId}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, color: "success.dark", mb: 0.75, px: 0.5 }}
                    >
                      {group.categoryLabel}
                    </Typography>
                    <List dense disablePadding>
                      {group.lines.map((line) => {
                        const product = productById.get(line.productId);
                        if (!product) return null;
                        const option = findShopOption(product, line.shopOrderUnitId);
                        const step = option?.qtyStep ?? 1;
                        const secondaryParts = [
                          formatShopQtyWithUnitLabel(
                            formatLineQty(line),
                            line.unitLabel,
                            line.shopOrderUnitId,
                            line.unitCode,
                          ),
                          formatShopPriceDh(locale, line.qty * line.priceAtAdd, line.equivKgAtAdd != null),
                        ];
                        if (
                          line.equivKgAtAdd != null &&
                          line.equivKgAtAdd > 0 &&
                          line.shopOrderUnitId != null
                        ) {
                          secondaryParts.push(
                            `soit ${formatShopKgEstimate(locale, line.qty * line.equivKgAtAdd)}`,
                          );
                        }
                        const photoUrl = productPhotoUrlById.get(line.productId) ?? null;
                        return (
                          <ListItem
                            key={cartLineKey(line)}
                            disableGutters
                            sx={{
                              py: 1,
                              px: 0,
                              alignItems: "flex-start",
                              gap: 1,
                              borderBottom: "1px solid",
                              borderColor: "divider",
                            }}
                          >
                            <Box
                              sx={{
                                position: "relative",
                                width: 52,
                                height: 52,
                                flexShrink: 0,
                                borderRadius: 1,
                                bgcolor: "grey.50",
                                border: "1px solid",
                                borderColor: "divider",
                                overflow: "hidden",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {photoUrl ? (
                                <Image
                                  src={photoUrl}
                                  alt=""
                                  fill
                                  className="object-contain"
                                  sizes="52px"
                                />
                              ) : (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                                  —
                                </Typography>
                              )}
                            </Box>
                            <ListItemText
                              sx={{ flex: 1, m: 0, minWidth: 0 }}
                              primary={productDisplayName(product, locale)}
                              slotProps={{
                                primary: { sx: { fontWeight: 600, fontSize: "0.875rem" } },
                              }}
                              secondary={secondaryParts.join(" — ")}
                            />
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
                              {line.comment?.trim() ? (
                                <ShopLineCommentBubble
                                  comment={line.comment}
                                  onClick={() =>
                                    onOpenLineComment(line.productId, line.shopOrderUnitId)
                                  }
                                  maxWidth={100}
                                />
                              ) : null}
                              <IconButton
                                size="small"
                                aria-label={
                                  line.comment?.trim()
                                    ? t("lineCommentEdit")
                                    : t("lineCommentAdd")
                                }
                                color={line.comment?.trim() ? "success" : "default"}
                                onClick={() =>
                                  onOpenLineComment(line.productId, line.shopOrderUnitId)
                                }
                              >
                                <ChatBubbleOutlineOutlinedIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="-"
                                onClick={() =>
                                  onUpdateLine(
                                    line.productId,
                                    line.shopOrderUnitId,
                                    subtractQtyByStep(line.qty, step),
                                  )
                                }
                              >
                                −
                              </IconButton>
                              <Typography
                                variant="body2"
                                sx={{ minWidth: "2rem", textAlign: "center", fontWeight: 700 }}
                              >
                                {formatLineQty(line)}
                              </Typography>
                              <IconButton
                                size="small"
                                aria-label="+"
                                onClick={() =>
                                  onUpdateLine(
                                    line.productId,
                                    line.shopOrderUnitId,
                                    addQtyByStep(line.qty, step),
                                  )
                                }
                              >
                                +
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={t("removeProduct")}
                                onClick={() =>
                                  onUpdateLine(line.productId, line.shopOrderUnitId, 0)
                                }
                              >
                                <DeleteOutlineOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </ListItem>
                        );
                      })}
                    </List>
                  </Box>
                ))}
              </Box>

              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 700 }}>
                {t("estimatedTotal")} : {formatShopPriceDh(locale, total, true)}
              </Typography>

              <ShopFulfillmentSelector
                mode={fulfillmentMode}
                onChange={onFulfillmentChange}
                pickupMagasinName={pickupMagasinName}
              />

              <ShopPaymentSelector method={paymentMethod} onChange={onPaymentChange} />

              <TextField
                label={t("orderCommentLabel")}
                placeholder={t("orderCommentPlaceholder")}
                value={orderComment}
                onChange={(e) => onOrderCommentChange(e.target.value)}
                multiline
                minRows={2}
                maxRows={4}
                fullWidth
                size="small"
                sx={{ mb: 1.5 }}
              />

              {!canExport ? (
                <Typography variant="body2" color="warning.dark" sx={{ mb: 1 }}>
                  {t("exportRequirements")}
                </Typography>
              ) : null}

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {whatsAppHref ? (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<WhatsAppIcon />}
                    onClick={() => void openWhatsApp()}
                    fullWidth
                  >
                    {t("sendWhatsApp")}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<WhatsAppIcon />}
                    onClick={() => setSnack(t("exportRequirements"))}
                    disabled={!isShopWhatsAppConfigured()}
                    fullWidth
                  >
                    {t("sendWhatsApp")}
                  </Button>
                )}
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<ContentCopyOutlinedIcon />}
                  onClick={() => void copyList()}
                  fullWidth
                >
                  {t("copyList")}
                </Button>
                <Button
                  variant="text"
                  color="inherit"
                  onClick={() => setClearConfirmOpen(true)}
                  fullWidth
                >
                  {t("clearCart")}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Drawer>

      <Dialog open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)}>
        <DialogTitle>{t("clearCartConfirmTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("clearCartConfirmMessage")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearConfirmOpen(false)}>{t("clearCartCancel")}</Button>
          <Button onClick={handleClearConfirm} color="error" variant="contained">
            {t("clearCartConfirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack != null}
        autoHideDuration={2500}
        onClose={() => setSnack(null)}
        message={snack ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

export function buildCartLineFromProduct(
  product: ShopProduct,
  shopOrderUnitId: string | null,
  qty: number,
  locale: AppLocale,
  canonicalKg?: number | null,
  comment?: string,
): ShopCartLine {
  const option = findShopOption(product, shopOrderUnitId);
  const unitLabel = option ? shopOptionLabel(option, locale) : "";
  const resolvedCanonicalKg =
    canonicalKg != null && canonicalKg > 0 ? canonicalKg : canonicalKgFromQty(qty, option);
  return {
    productId: product.id,
    shopOrderUnitId,
    qty,
    unitCode: option?.unitCode ?? "unite",
    unitLabel,
    priceAtAdd: option?.unitPrice ?? product.price,
    equivKgAtAdd:
      shopOrderUnitId != null && option?.equivKg != null ? option.equivKg : null,
    canonicalKg: resolvedCanonicalKg,
    comment,
  };
}
