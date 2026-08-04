"use client";

import Image from "next/image";
import { useMemo } from "react";
import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, Chip, IconButton, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import {
  findShopOption,
  resolveShopOrderOptions,
  shopOptionLabel,
} from "@/lib/shop/shop-order-options";
import {
  formatShopPieceWeightHint,
  formatShopPriceWithUnit,
  formatShopQty,
} from "@/lib/shop/format-price";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import { productDisplayName } from "@/lib/products/product-display-name";
import { labelFromRefForLocale } from "@/lib/commandes-fournisseur/product-display";
import type { ShopProduct } from "@/lib/shop/types";
import ShopLineCommentBubble from "@/app/shop/ShopLineCommentBubble";

type Props = {
  product: ShopProduct;
  photoUrl: string | null;
  qty: number;
  selectedShopOrderUnitId: string | null;
  lineComment?: string | null;
  onSelectUnit: (shopOrderUnitId: string | null) => void;
  onAdd: () => void;
  onRemove: () => void;
  onClearProduct?: () => void;
  onOpenComment?: () => void;
};

export default function ShopProductCard({
  product,
  photoUrl,
  qty,
  selectedShopOrderUnitId,
  lineComment = null,
  onSelectUnit,
  onAdd,
  onRemove,
  onClearProduct,
  onOpenComment,
}: Props) {
  const t = useTranslations("shop");
  const locale = useAppLocale();
  const label = productDisplayName(product, locale);
  const options = useMemo(() => resolveShopOrderOptions(product), [product]);
  const option = findShopOption(product, selectedShopOrderUnitId) ?? options[0] ?? null;
  const inCart = qty > 0;
  const hasComment = Boolean(lineComment?.trim());
  const qtyNumber = option ? formatShopQty(locale, qty, option.unitCode) : "0";
  const qtyUnitLabel = option ? shopOptionLabel(option, locale) : "";
  const priceUnitLabel = labelFromRefForLocale(product.ref_sales_unit, locale);
  const pieceWeight =
    product.piece_weight_kg != null && Number(product.piece_weight_kg) > 0
      ? Number(product.piece_weight_kg)
      : null;

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: inCart ? "success.light" : "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        boxShadow: inCart ? "0 0 0 1px rgba(22,163,74,0.2)" : "none",
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: { xs: 96, sm: 104 },
          flexShrink: 0,
          bgcolor: "grey.50",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 0.5,
        }}
      >
        {photoUrl ? (
          <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
            <Image
              src={photoUrl}
              alt={label}
              fill
              className="object-contain"
              sizes="(max-width: 600px) 45vw, 160px"
            />
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
            —
          </Typography>
        )}
        {inCart && onClearProduct ? (
          <IconButton
            size="small"
            aria-label={t("removeProduct")}
            onClick={onClearProduct}
            sx={{
              position: "absolute",
              top: 4,
              left: 4,
              width: 28,
              height: 28,
              bgcolor: "rgba(255,255,255,0.92)",
              border: "1px solid",
              borderColor: "error.light",
              color: "error.main",
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
              "&:hover": { bgcolor: "error.light", color: "error.dark" },
            }}
          >
            <DeleteOutlineOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        ) : null}
        {inCart && onOpenComment ? (
          <Box
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 0.25,
              maxWidth: "calc(100% - 8px)",
            }}
          >
            {hasComment ? (
              <ShopLineCommentBubble
                comment={lineComment ?? ""}
                onClick={onOpenComment}
                maxWidth={100}
              />
            ) : null}
            <IconButton
              size="small"
              aria-label={hasComment ? t("lineCommentEdit") : t("lineCommentAdd")}
              onClick={onOpenComment}
              sx={{
                width: 28,
                height: 28,
                flexShrink: 0,
                bgcolor: "rgba(255,255,255,0.92)",
                border: "1px solid",
                borderColor: hasComment ? "success.light" : "divider",
                color: hasComment ? "success.dark" : "text.secondary",
                boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                "&:hover": { bgcolor: "rgba(236, 253, 245, 0.95)" },
              }}
            >
              <ChatBubbleOutlineOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        ) : null}
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", px: 0.875, pt: 0.375, pb: 0.75, gap: 0.375 }}>
        <Box
          sx={{
            minHeight: "2.75em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 0.75,
            py: 0.5,
            borderRadius: 1,
            bgcolor: "rgba(236, 253, 245, 0.9)",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              lineHeight: 1.25,
              fontWeight: 600,
              fontSize: "0.8rem",
              textAlign: "center",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              color: "success.dark",
              width: "100%",
            }}
          >
            {label}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          color="success.dark"
          sx={{ fontWeight: 700, fontSize: "0.68rem", lineHeight: 1.2, textAlign: "center" }}
        >
          {formatShopPriceWithUnit(locale, product.price, priceUnitLabel)}
        </Typography>
        {pieceWeight != null && options.some((o) => o.shopOrderUnitId != null) ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", lineHeight: 1.2 }}>
            {formatShopPieceWeightHint(locale, pieceWeight)}
          </Typography>
        ) : null}

        {options.length > 1 ? (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 0.5,
              mt: 0.375,
            }}
          >
            {options.map((o) => {
              const selected = o.shopOrderUnitId === selectedShopOrderUnitId;
              return (
                <Chip
                  key={o.shopOrderUnitId ?? "__udv__"}
                  label={shopOptionLabel(o, locale)}
                  color={selected ? "success" : "default"}
                  variant={selected ? "filled" : "outlined"}
                  onClick={() => onSelectUnit(o.shopOrderUnitId)}
                  sx={{
                    height: 30,
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    "& .MuiChip-label": { px: 1, py: 0.25 },
                  }}
                />
              );
            })}
          </Box>
        ) : null}

        <Box
          sx={{
            mt: "auto",
            pt: 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
          }}
        >
          <IconButton
            color="inherit"
            aria-label="-"
            disabled={qty <= 0 || !option}
            onClick={onRemove}
            sx={{
              width: 36,
              height: 36,
              border: "1px solid",
              borderColor: "divider",
              p: 0,
            }}
          >
            <RemoveIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "2.75rem",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
                fontSize: "0.85rem",
                lineHeight: 1.2,
                textAlign: "center",
              }}
            >
              {qtyNumber}
            </Typography>
            {qtyUnitLabel ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontSize: "0.62rem",
                  lineHeight: 1.2,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {qtyUnitLabel}
              </Typography>
            ) : null}
          </Box>
          <IconButton
            color="success"
            aria-label="+"
            disabled={!option}
            onClick={onAdd}
            sx={{
              width: 36,
              height: 36,
              border: "1px solid",
              borderColor: "success.light",
              p: 0,
            }}
          >
            <AddIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
