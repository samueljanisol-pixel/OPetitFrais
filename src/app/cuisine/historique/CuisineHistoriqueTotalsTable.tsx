"use client";

import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { AppLocale } from "@/i18n/config";
import { productDisplayName } from "@/lib/products/product-display-name";
import type { CuisineSubcategoryTotalsGroup } from "@/lib/cuisine/types";

const denseCell = { py: 0.5, px: 0.75, fontSize: "0.75rem", lineHeight: 1.3 };
const denseHead = { ...denseCell, fontWeight: 700, whiteSpace: "nowrap" as const };
const metricHead = {
  ...denseHead,
  width: "2.75rem",
  minWidth: "2.75rem",
  maxWidth: "3.25rem",
  px: 0.5,
  pl: 0.75,
  pr: 0.25,
};
const metricCell = {
  ...denseCell,
  width: "2.75rem",
  minWidth: "2.75rem",
  maxWidth: "3.25rem",
  px: 0.5,
  pl: 0.75,
  pr: 0.25,
  fontWeight: 600,
};
const magHead = {
  ...denseHead,
  width: "2.5rem",
  minWidth: "2.5rem",
  maxWidth: "2.75rem",
  px: 0.5,
  fontSize: "0.7rem",
};
const magCell = {
  ...denseCell,
  width: "2.5rem",
  minWidth: "2.5rem",
  maxWidth: "2.75rem",
  px: 0.5,
  fontWeight: 600,
  fontSize: "0.7rem",
};

type Props = {
  groups: CuisineSubcategoryTotalsGroup[];
  locale: AppLocale;
  formatQty: (value: number) => string;
  magasinColumns: string[];
  labels: {
    product: string;
    entrees: string;
    sorties: string;
    ventes: string;
    ventesTotal: string;
    entreesShort: string;
    sortiesShort: string;
    ventesShort: string;
    ventesTotalShort: string;
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

function QtyCell({ value, formatQty }: { value: number; formatQty: (value: number) => string }) {
  return value > 0 ? formatQty(value) : "—";
}

export default function CuisineHistoriqueTotalsTable({
  groups,
  locale,
  formatQty,
  magasinColumns,
  labels,
}: Props) {
  const showMagColumns = magasinColumns.length > 0;

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
              overflowX: "auto",
            }}
          >
            <Table size="small" sx={{ tableLayout: "fixed", minWidth: showMagColumns ? 420 : 280 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell sx={{ ...denseHead, pr: 1, minWidth: "6rem" }}>{labels.product}</TableCell>
                  <TableCell align="right" sx={metricHead}>
                    <MetricHeader full={labels.entrees} short={labels.entreesShort} />
                  </TableCell>
                  <TableCell align="right" sx={{ ...metricHead, pl: 1 }}>
                    <MetricHeader full={labels.sorties} short={labels.sortiesShort} />
                  </TableCell>
                  {showMagColumns
                    ? magasinColumns.map((mag) => (
                        <TableCell key={mag} align="right" sx={magHead}>
                          {mag}
                        </TableCell>
                      ))
                    : (
                        <TableCell align="right" sx={{ ...metricHead, pl: 1 }}>
                          <MetricHeader full={labels.ventes} short={labels.ventesShort} />
                        </TableCell>
                      )}
                  {showMagColumns ? (
                    <TableCell align="right" sx={{ ...metricHead, pl: 0.75 }}>
                      <MetricHeader full={labels.ventesTotal} short={labels.ventesTotalShort} />
                    </TableCell>
                  ) : null}
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
                      <QtyCell value={product.entrees} formatQty={formatQty} />
                    </TableCell>
                    <TableCell align="right" sx={{ ...metricCell, pl: 1 }}>
                      <QtyCell value={product.sorties} formatQty={formatQty} />
                    </TableCell>
                    {showMagColumns
                      ? magasinColumns.map((mag) => (
                          <TableCell key={mag} align="right" sx={magCell}>
                            <QtyCell value={product.ventesByMagasin?.[mag] ?? 0} formatQty={formatQty} />
                          </TableCell>
                        ))
                      : (
                          <TableCell align="right" sx={{ ...metricCell, pl: 1 }}>
                            <QtyCell value={product.ventes ?? 0} formatQty={formatQty} />
                          </TableCell>
                        )}
                    {showMagColumns ? (
                      <TableCell align="right" sx={{ ...metricCell, pl: 0.75 }}>
                        <QtyCell value={product.ventes ?? 0} formatQty={formatQty} />
                      </TableCell>
                    ) : null}
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
