"use client";

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { AppLocale } from "@/i18n/config";
import { productDisplayName } from "@/lib/products/product-display-name";
import type { CuisineSubcategoryTotalsGroup } from "@/lib/cuisine/types";

type Props = {
  groups: CuisineSubcategoryTotalsGroup[];
  locale: AppLocale;
  formatQty: (value: number) => string;
  labels: {
    product: string;
    entrees: string;
    sorties: string;
  };
};

export default function CuisineHistoriqueTotalsTable({ groups, locale, formatQty, labels }: Props) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {groups.map((group) => (
        <section key={group.subcategoryId ?? "__none__"}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            {group.subcategoryLabel}
          </Typography>
          <TableContainer
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell sx={{ fontWeight: 700 }}>{labels.product}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, width: "5.5rem" }}>
                    {labels.entrees}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, width: "5.5rem" }}>
                    {labels.sorties}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {group.products.map((product) => (
                  <TableRow key={product.productId} hover>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600 }}
                        dir={locale === "ar-MA" ? "rtl" : undefined}
                        lang={locale === "ar-MA" ? "ar" : undefined}
                      >
                        {productDisplayName(product, locale)}
                      </Typography>
                      {product.unit ? (
                        <Typography variant="caption" color="text.secondary">
                          {product.unit}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {product.entrees > 0 ? formatQty(product.entrees) : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
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
