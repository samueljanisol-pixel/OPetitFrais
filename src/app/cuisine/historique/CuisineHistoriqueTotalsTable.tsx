"use client";

import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { AppLocale } from "@/i18n/config";
import { productDisplayName } from "@/lib/products/product-display-name";
import type { CuisineSubcategoryTotalsGroup } from "@/lib/cuisine/types";

const denseCell = { py: 0.5, px: 0.75, fontSize: "0.75rem", lineHeight: 1.3 };
const denseHead = { ...denseCell, fontWeight: 700, whiteSpace: "nowrap" as const };
const metricHead = {
  ...denseHead,
  width: "3.75rem",
  minWidth: "3.75rem",
  maxWidth: "4.25rem",
  px: 1,
  pl: 1.25,
  pr: 0.5,
};
const metricCell = {
  ...denseCell,
  width: "3.75rem",
  minWidth: "3.75rem",
  maxWidth: "4.25rem",
  px: 1,
  pl: 1.25,
  pr: 0.5,
  fontWeight: 600,
};

type Props = {
  groups: CuisineSubcategoryTotalsGroup[];
  locale: AppLocale;
  formatQty: (value: number) => string;
  labels: {
    product: string;
    entrees: string;
    sorties: string;
    ventes: string;
    entreesShort: string;
    sortiesShort: string;
    ventesShort: string;
  };
};

function MetricHeader({
  full,
  short,
}: {
  full: string;
  short: string;
}) {
  return (
    <>
      <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
        {full}
      </Box>
      <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
        {short}
      </Box>
    </>
  );
}

export default function CuisineHistoriqueTotalsTable({ groups, locale, formatQty, labels }: Props) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      {groups.map((group) => (
        <section key={group.subcategoryId ?? "__none__"}>
          <Typography
            variant="caption"
            component="h2"
            sx={{ fontWeight: 700, display: "block", mb: 0.5, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em" }}
          >
            {group.subcategoryLabel}
          </Typography>
          <TableContainer
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              overflow: "hidden",
            }}
          >
            <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell sx={{ ...denseHead, pr: 1 }}>{labels.product}</TableCell>
                  <TableCell align="right" sx={metricHead}>
                    <MetricHeader full={labels.entrees} short={labels.entreesShort} />
                  </TableCell>
                  <TableCell align="right" sx={{ ...metricHead, pl: 1.5 }}>
                    <MetricHeader full={labels.sorties} short={labels.sortiesShort} />
                  </TableCell>
                  <TableCell align="right" sx={{ ...metricHead, pl: 1.5 }}>
                    <MetricHeader full={labels.ventes} short={labels.ventesShort} />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {group.products.map((product) => (
                  <TableRow key={product.productId} hover>
                    <TableCell sx={{ ...denseCell, pr: 1 }}>
                      <Typography
                        variant="caption"
                        component="span"
                        sx={{
                          fontWeight: 600,
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        dir={locale === "ar-MA" ? "rtl" : undefined}
                        lang={locale === "ar-MA" ? "ar" : undefined}
                        title={productDisplayName(product, locale)}
                      >
                        {productDisplayName(product, locale)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={metricCell}>
                      {product.entrees > 0 ? formatQty(product.entrees) : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ ...metricCell, pl: 1.5 }}>
                      {product.sorties > 0 ? formatQty(product.sorties) : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ ...metricCell, pl: 1.5 }}>
                      {(product.ventes ?? 0) > 0 ? formatQty(product.ventes ?? 0) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </section>
      ))}
    </Box>
  );
}
