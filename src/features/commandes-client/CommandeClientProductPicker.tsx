"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import FormDialog from "@/lib/mui/FormDialog";
import { productDisplayName } from "@/lib/products/product-display-name";
import { buildCartLineFromProduct } from "@/app/shop/ShopCartPanel";
import { favoriteShopOrderUnitId, findShopOption, resolveShopOrderOptions, shopOptionLabel } from "@/lib/shop/shop-order-options";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { ShopProduct } from "@/lib/shop/types";
import type { ShopCartWorkflowLine } from "@/lib/commandes-client/workflow";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (line: ShopCartWorkflowLine) => void;
};

function cartLineToWorkflowLine(
  line: ReturnType<typeof buildCartLineFromProduct>,
): ShopCartWorkflowLine {
  return {
    productId: line.productId,
    shopOrderUnitId: line.shopOrderUnitId ?? undefined,
    qty: line.qty,
    unitCode: line.unitCode,
    unitLabel: line.unitLabel,
    priceAtAdd: line.priceAtAdd,
    equivKgAtAdd: line.equivKgAtAdd ?? undefined,
    canonicalKg: line.canonicalKg,
    comment: line.comment ?? null,
    prepared: false,
  };
}

export default function CommandeClientProductPicker({ open, onClose, onAdd }: Props) {
  const t = useTranslations("backoffice.commandesClient.productPicker");
  const tCommon = useTranslations("common");
  const locale = useAppLocale();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [unitId, setUnitId] = useState<string>("");
  const [qty, setQty] = useState("1");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/commandes-client/shop-catalog");
      const json = (await res.json()) as { products?: ShopProduct[]; error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        setProducts([]);
        return;
      }
      setProducts(json.products ?? []);
    } catch {
      setErr(tCommon("networkError"));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [tCommon]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSelectedProduct(null);
    setUnitId("");
    setQty("1");
    void load();
  }, [open, load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return products.slice(0, 80);
    return products
      .filter((p) => {
        const name = productDisplayName(p, locale).toLowerCase();
        return name.includes(needle) || p.code.toLowerCase().includes(needle);
      })
      .slice(0, 80);
  }, [products, q, locale]);

  const unitOptions = useMemo(
    () => (selectedProduct ? resolveShopOrderOptions(selectedProduct) : []),
    [selectedProduct],
  );

  useEffect(() => {
    if (!selectedProduct) return;
    const fav = favoriteShopOrderUnitId(selectedProduct);
    setUnitId(fav ?? "");
    const option = findShopOption(selectedProduct, fav);
    setQty(String(option?.qtyStep ?? 1));
  }, [selectedProduct]);

  const handleConfirmAdd = () => {
    if (!selectedProduct) return;
    const parsedQty = Number.parseFloat(qty.replace(",", "."));
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) return;
    const resolvedUnitId = unitId || null;
    const line = buildCartLineFromProduct(
      selectedProduct,
      resolvedUnitId,
      parsedQty,
      locale,
    );
    onAdd(cartLineToWorkflowLine(line));
    setSelectedProduct(null);
    setQ("");
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{t("title")}</DialogTitle>
      <DialogContent>
        {err ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        ) : null}

        {selectedProduct ? (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {productDisplayName(selectedProduct, locale)} ({selectedProduct.code})
            </Typography>
            {unitOptions.length > 1 ? (
              <TextField
                select
                label={t("unit")}
                value={unitId}
                onChange={(e) => {
                  setUnitId(e.target.value);
                  const option = findShopOption(selectedProduct, e.target.value || null);
                  if (option) setQty(String(option.qtyStep));
                }}
                fullWidth
              >
                {unitOptions.map((opt) => (
                  <MenuItem key={opt.shopOrderUnitId ?? "udv"} value={opt.shopOrderUnitId ?? ""}>
                    {shopOptionLabel(opt, locale)}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            <TextField
              label={t("qty")}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              fullWidth
              inputMode="decimal"
            />
            <Button size="small" onClick={() => setSelectedProduct(null)} sx={{ textTransform: "none", alignSelf: "flex-start" }}>
              {t("backToList")}
            </Button>
          </Stack>
        ) : (
          <>
            <TextField
              label={t("search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              fullWidth
              autoFocus
              sx={{ mb: 1, mt: 0.5 }}
            />
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <List dense disablePadding sx={{ maxHeight: 360, overflow: "auto" }}>
                {filtered.map((p) => (
                  <ListItemButton key={p.id} onClick={() => setSelectedProduct(p)}>
                    <ListItemText
                      primary={productDisplayName(p, locale)}
                      secondary={`${p.code} · ${p.price.toFixed(2)} DH`}
                    />
                  </ListItemButton>
                ))}
                {filtered.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 1 }}>
                    {t("empty")}
                  </Typography>
                ) : null}
              </List>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon("cancel")}</Button>
        {selectedProduct ? (
          <Button variant="contained" color="success" onClick={handleConfirmAdd}>
            {t("add")}
          </Button>
        ) : null}
      </DialogActions>
    </FormDialog>
  );
}
