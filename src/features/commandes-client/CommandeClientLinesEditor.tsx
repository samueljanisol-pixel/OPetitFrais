"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { productDisplayName } from "@/lib/products/product-display-name";
import { formatDh } from "@/features/commandes-client/workflow-labels";
import { formatShopLineQtyParts } from "@/lib/shop/format-price";
import {
  commandeWorkflowLineKey,
  groupWorkflowLinesByCategory,
  type CategoryMeta,
} from "@/lib/commandes-client/group-workflow-lines-by-category";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { ShopProduct } from "@/lib/shop/types";
import type { ShopCartWorkflowLine } from "@/lib/commandes-client/workflow";

type Props = {
  lines: ShopCartWorkflowLine[];
  productById: Map<string, ShopProduct>;
  categoryMeta: Map<string, CategoryMeta>;
  onChange: (lines: ShopCartWorkflowLine[]) => void;
  onAddProduct: () => void;
  readOnly?: boolean;
};

export function estimateFromLines(lines: ShopCartWorkflowLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty * line.priceAtAdd, 0);
}

export function mergeWorkflowLine(
  lines: ShopCartWorkflowLine[],
  incoming: ShopCartWorkflowLine,
): ShopCartWorkflowLine[] {
  const key = commandeWorkflowLineKey(incoming);
  const idx = lines.findIndex((l) => commandeWorkflowLineKey(l) === key);
  if (idx < 0) return [...lines, incoming];
  const next = [...lines];
  const existing = next[idx];
  next[idx] = {
    ...existing,
    qty: existing.qty + incoming.qty,
    priceAtAdd: incoming.priceAtAdd,
    unitCode: incoming.unitCode ?? existing.unitCode,
    unitLabel: incoming.unitLabel ?? existing.unitLabel,
  };
  return next;
}

export default function CommandeClientLinesEditor({
  lines,
  productById,
  categoryMeta,
  onChange,
  onAddProduct,
  readOnly = false,
}: Props) {
  const t = useTranslations("backoffice.commandesClient.detail");
  const tCommon = useTranslations("common");
  const locale = useAppLocale();

  const total = useMemo(() => estimateFromLines(lines), [lines]);

  const groupedLines = useMemo(
    () =>
      groupWorkflowLinesByCategory(
        lines,
        productById,
        categoryMeta,
        t("uncategorized"),
        locale,
      ),
    [lines, productById, categoryMeta, t, locale],
  );

  const updateLine = (key: string, patch: Partial<ShopCartWorkflowLine>) => {
    onChange(
      lines.map((line) =>
        commandeWorkflowLineKey(line) === key ? { ...line, ...patch } : line,
      ),
    );
  };

  const removeLine = (key: string) => {
    onChange(lines.filter((line) => commandeWorkflowLineKey(line) !== key));
  };

  const lineLabel = (line: ShopCartWorkflowLine) => {
    const product = productById.get(line.productId);
    if (product) return productDisplayName(product, locale);
    return `${t("unknownProduct")} (${line.productId.slice(0, 8)})`;
  };

  if (readOnly) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 3 }}>
        {lines.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("emptyLines")}
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {groupedLines.map((group) => (
              <Box key={group.categoryId}>
                <Typography
                  variant="overline"
                  sx={{
                    display: "block",
                    fontWeight: 700,
                    color: "text.secondary",
                    letterSpacing: 0.6,
                    mb: 0.5,
                  }}
                >
                  {group.categoryLabel}
                </Typography>
                <Stack divider={<Divider flexItem />} spacing={0.75}>
                  {group.items.map((line) => {
                    const key = commandeWorkflowLineKey(line);
                    const label = lineLabel(line);
                    const { qtyLabel, kgHint } = formatShopLineQtyParts(line, locale);
                    return (
                      <Box key={key} sx={{ py: 0.25 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
                        >
                          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                            {label}
                            {line.prepared ? " ✓" : ""}
                          </Typography>
                          <Stack spacing={0.25} sx={{ alignItems: "flex-end", flexShrink: 0 }}>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ whiteSpace: "nowrap", textAlign: "right" }}
                            >
                              {qtyLabel}
                            </Typography>
                            {kgHint ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ whiteSpace: "nowrap", textAlign: "right" }}
                              >
                                {kgHint}
                              </Typography>
                            ) : null}
                          </Stack>
                          <Typography
                            variant="body2"
                            sx={{ minWidth: 72, textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            {formatDh(line.qty * line.priceAtAdd)} DH
                          </Typography>
                        </Stack>
                        {line.comment ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.25 }}
                          >
                            {line.comment}
                          </Typography>
                        ) : null}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
        <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
          {t("estimate")} : {formatDh(total)} DH
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 1.5 }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {t("lines")}
        </Typography>
        {!readOnly ? (
          <Button size="small" variant="outlined" onClick={onAddProduct} sx={{ textTransform: "none" }}>
            {t("addLine")}
          </Button>
        ) : null}
      </Stack>

      {lines.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t("emptyLines")}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {groupedLines.map((group) => (
            <Box key={group.categoryId}>
              <Typography
                variant="overline"
                sx={{
                  display: "block",
                  fontWeight: 700,
                  color: "text.secondary",
                  letterSpacing: 0.6,
                  mb: 1,
                }}
              >
                {group.categoryLabel}
              </Typography>
              <Stack spacing={1.5}>
                {group.items.map((line) => {
                  const key = commandeWorkflowLineKey(line);
                  const label = lineLabel(line);
                  return (
                    <Box
                      key={key}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        p: 1.25,
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600 }}>{label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {line.unitLabel ?? tCommon("emDash")} · {formatDh(line.priceAtAdd)} DH
                          </Typography>
                        </Box>
                        {!readOnly ? (
                          <IconButton
                            size="small"
                            aria-label={t("removeLine")}
                            onClick={() => removeLine(key)}
                          >
                            <DeleteOutlineOutlinedIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                      </Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
                        <TextField
                          label={t("qty")}
                          value={line.qty}
                          onChange={(e) => {
                            const parsed = Number.parseFloat(e.target.value.replace(",", "."));
                            if (Number.isFinite(parsed) && parsed > 0) {
                              updateLine(key, { qty: parsed });
                            }
                          }}
                          disabled={readOnly}
                          size="small"
                          sx={{ width: { sm: 120 } }}
                          inputMode="decimal"
                        />
                        <TextField
                          label={t("lineComment")}
                          value={line.comment ?? ""}
                          onChange={(e) => updateLine(key, { comment: e.target.value || null })}
                          disabled={readOnly}
                          size="small"
                          fullWidth
                        />
                        <Typography
                          variant="body2"
                          sx={{ alignSelf: "center", minWidth: 88, textAlign: "right" }}
                        >
                          {formatDh(line.qty * line.priceAtAdd)} DH
                        </Typography>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
        {t("estimate")} : {formatDh(total)} DH
      </Typography>
    </Paper>
  );
}
