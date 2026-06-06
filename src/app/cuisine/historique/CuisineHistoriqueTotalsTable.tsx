"use client";

import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { AppLocale } from "@/i18n/config";
import { productDisplayName } from "@/lib/products/product-display-name";
import type { CuisineSubcategoryTotalsGroup } from "@/lib/cuisine/types";

const denseCell = { py: 0.5, px: 0.75, fontSize: "0.75rem", lineHeight: 1.3 };
const denseHead = { ...denseCell, fontWeight: 700, whiteSpace: "nowrap" as const };

type Props = {
  groups: CuisineSubcategoryTotalsGroup[];
  locale: AppLocale;
  formatQty: (value: number) => string;
  labels: {
    product: string;
    entrees: string;
    sorties: string;
    entreesShort: string;
    sortiesShort: string;
  };
};

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
            <Table size="small" sx={{ tableLayout: "fixed" }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell sx={denseHead}>{labels.product}</TableCell>
                  <TableCell align="right" sx={{ ...denseHead, width: "2.75rem" }}>
                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                      {labels.entrees}
                    </Box>
                    <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                      {labels.entreesShort}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ ...denseHead, width: "2.75rem" }}>
                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                      {labels.sorties}
                    </Box>
                    <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                      {labels.sortiesShort}
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {group.products.map((product) => (
                  <TableRow key={product.productId} hover>
                    <TableCell sx={denseCell}>
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
                    <TableCell align="right" sx={{ ...denseCell, fontWeight: 600 }}>
                      {product.entrees > 0 ? formatQty(product.entrees) : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ ...denseCell, fontWeight: 600 }}>
                      {product.sorties > 0 ? formatQty(product.sorties) : "—"}
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
