"use client";

import Image from "next/image";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, IconButton, Typography } from "@mui/material";
import { productDisplayName } from "@/lib/products/product-display-name";
import { useAppFormat, useAppLocale } from "@/lib/i18n/useAppFormat";
import type { ShopProduct } from "@/lib/shop/types";

type Props = {
  product: ShopProduct;
  photoUrl: string | null;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
};

export default function ShopProductCard({ product, photoUrl, qty, onAdd, onRemove }: Props) {
  const locale = useAppLocale();
  const { formatCurrency } = useAppFormat();
  const label = productDisplayName(product, locale);
  const inCart = qty > 0;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRadius: 2,
        border: "1px solid",
        borderColor: inCart ? "success.light" : "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        boxShadow: inCart ? "0 0 0 1px rgba(22,163,74,0.25)" : "none",
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: "1",
          bgcolor: "grey.50",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 0.75,
        }}
      >
        {photoUrl ? (
          <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
            <Image src={photoUrl} alt="" fill className="object-contain" sizes="160px" />
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        )}
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", p: 1, gap: 0.5 }}>
        <Typography
          variant="body2"
          sx={{ lineHeight: 1.25, minHeight: "2.5em", fontWeight: 600 }}
        >
          {label}
        </Typography>
        <Typography variant="body2" color="success.dark" sx={{ fontWeight: 700 }}>
          {formatCurrency(product.price)}
        </Typography>

        {inCart ? (
          <Box
            sx={{
              mt: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 0.5,
            }}
          >
            <IconButton
              size="small"
              color="inherit"
              aria-label="-"
              onClick={onRemove}
              sx={{ border: "1px solid", borderColor: "divider" }}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
              {qty}
            </Typography>
            <IconButton
              size="small"
              color="success"
              aria-label="+"
              onClick={onAdd}
              sx={{ border: "1px solid", borderColor: "success.light" }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <IconButton
            color="success"
            aria-label="+"
            onClick={onAdd}
            sx={{
              mt: "auto",
              alignSelf: "center",
              border: "1px solid",
              borderColor: "success.light",
              bgcolor: "success.50",
            }}
          >
            <AddIcon />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
