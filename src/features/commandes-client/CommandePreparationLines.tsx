"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import {
  Box,
  CircularProgress,
  Divider,
  ListItemButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { productDisplayName } from "@/lib/products/product-display-name";
import {
  commandeWorkflowLineKey,
  groupWorkflowLinesByCategory,
  type CategoryMeta,
} from "@/lib/commandes-client/group-workflow-lines-by-category";
import { formatShopLineQtyParts } from "@/lib/shop/format-price";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { ShopProduct } from "@/lib/shop/types";
import {
  getLinePreparationStatus,
  type LinePreparationStatus,
  type ShopCartWorkflowLine,
} from "@/lib/commandes-client/workflow";

const LONG_PRESS_MS = 500;

type Props = {
  lines: ShopCartWorkflowLine[];
  productById: Map<string, ShopProduct>;
  categoryMeta: Map<string, CategoryMeta>;
  togglingKey?: string | null;
  onLineStatus: (line: ShopCartWorkflowLine, status: LinePreparationStatus) => void;
};

function StatusIcon({ status }: { status: LinePreparationStatus }) {
  if (status === "available") {
    return <CheckCircleOutlinedIcon sx={{ color: "success.main", fontSize: 28 }} />;
  }
  if (status === "unavailable") {
    return <HighlightOffIcon sx={{ color: "error.main", fontSize: 28 }} />;
  }
  return <RadioButtonUncheckedIcon sx={{ color: "text.disabled", fontSize: 28 }} />;
}

export default function CommandePreparationLines({
  lines,
  productById,
  categoryMeta,
  togglingKey = null,
  onLineStatus,
}: Props) {
  const tDetail = useTranslations("backoffice.commandesClient.detail");
  const tPrep = useTranslations("backoffice.commandesClient.preparation");
  const locale = useAppLocale();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const groupedLines = useMemo(
    () =>
      groupWorkflowLinesByCategory(
        lines,
        productById,
        categoryMeta,
        tDetail("uncategorized"),
        locale,
      ),
    [lines, productById, categoryMeta, tDetail, locale],
  );

  const lineLabel = (line: ShopCartWorkflowLine) => {
    const product = productById.get(line.productId);
    if (product) return productDisplayName(product, locale);
    return `${tDetail("unknownProduct")} (${line.productId.slice(0, 8)})`;
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (line: ShopCartWorkflowLine, status: LinePreparationStatus) => {
    if (status !== "unchecked") return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLineStatus(line, "unavailable");
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = (line: ShopCartWorkflowLine, status: LinePreparationStatus) => {
    clearLongPressTimer();
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (status === "unchecked") {
      onLineStatus(line, "available");
      return;
    }
    onLineStatus(line, "unchecked");
  };

  if (lines.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {tDetail("emptyLines")}
      </Typography>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        {tPrep("lineHint")}
      </Typography>
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
                mb: 0.75,
              }}
            >
              {group.categoryLabel}
            </Typography>
            <Stack divider={<Divider flexItem />} spacing={0}>
              {group.items.map((line) => {
                const key = commandeWorkflowLineKey(line);
                const label = lineLabel(line);
                const { qtyLabel, kgHint } = formatShopLineQtyParts(line, locale);
                const busy = togglingKey === key;
                const status = getLinePreparationStatus(line);
                const isMarked = status !== "unchecked";
                return (
                  <ListItemButton
                    key={key}
                    disabled={busy}
                    onPointerDown={() => handlePointerDown(line, status)}
                    onPointerUp={() => handlePointerUp(line, status)}
                    onPointerLeave={clearLongPressTimer}
                    onPointerCancel={clearLongPressTimer}
                    sx={{
                      py: 1,
                      alignItems: "flex-start",
                      opacity: busy ? 0.6 : 1,
                      bgcolor:
                        status === "available"
                          ? "success.50"
                          : status === "unavailable"
                            ? "error.50"
                            : "transparent",
                      "&:hover": {
                        bgcolor:
                          status === "available"
                            ? "success.100"
                            : status === "unavailable"
                              ? "error.100"
                              : "action.hover",
                      },
                    }}
                  >
                    <Box sx={{ mr: 1, mt: -0.25, flexShrink: 0 }}>
                      {busy ? <CircularProgress size={24} /> : <StatusIcon status={status} />}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            flex: 1,
                            fontWeight: isMarked ? 500 : 600,
                            textDecoration: status === "unavailable" ? "line-through" : "none",
                            color: status === "unavailable" ? "error.dark" : "text.primary",
                          }}
                        >
                          {label}
                        </Typography>
                        <Stack spacing={0.25} sx={{ alignItems: "flex-end", flexShrink: 0 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                            {qtyLabel}
                          </Typography>
                          {kgHint ? (
                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                              {kgHint}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Stack>
                      {line.comment ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          {line.comment}
                        </Typography>
                      ) : null}
                    </Box>
                  </ListItemButton>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
