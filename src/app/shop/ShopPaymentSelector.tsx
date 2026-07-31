"use client";

import { useTranslations } from "next-intl";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { ShopPaymentMethod } from "@/lib/shop/payment-types";
import { shopChoiceToggleGroupSx } from "@/lib/shop/shop-toggle-group-sx";

type Props = {
  method: ShopPaymentMethod | null;
  onChange: (method: ShopPaymentMethod) => void;
};

export default function ShopPaymentSelector({ method, onChange }: Props) {
  const t = useTranslations("shop");

  return (
    <Box
      sx={{
        mb: 1.5,
        p: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "success.light",
        bgcolor: "rgba(236, 253, 245, 0.7)",
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "success.dark", mb: 1 }}>
        {t("payment.title")}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={method}
        onChange={(_, v: ShopPaymentMethod | null) => {
          if (v) onChange(v);
        }}
        sx={shopChoiceToggleGroupSx}
      >
        <ToggleButton value="cash" color="success">
          {t("payment.cash")}
        </ToggleButton>
        <ToggleButton value="card" color="success">
          {t("payment.card")}
        </ToggleButton>
      </ToggleButtonGroup>
      {method == null ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {t("payment.chooseHint")}
        </Typography>
      ) : null}
    </Box>
  );
}
