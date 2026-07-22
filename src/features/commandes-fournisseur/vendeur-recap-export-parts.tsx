"use client";

import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import {
  formatRecapQtyCell,
  type MagasinMxColumn,
  type VendeurRecapGroup,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

export const exportTableSx = {
  width: "max-content",
  maxWidth: "none",
  tableLayout: "auto" as const,
  "& .MuiTableCell-root": {
    border: "1px solid #ccc",
    py: 0.5,
    px: 0.5,
    fontSize: "0.8125rem",
    whiteSpace: "nowrap" as const,
    width: "auto",
  },
  "& .MuiTableHead-root .MuiTableCell-root": {
    fontWeight: 700,
    bgcolor: "#f5f5f5",
  },
};

export const captureRootSx = {
  display: "inline-block",
  width: "max-content",
  maxWidth: "none",
  background: "#fff",
  p: 2,
  fontFamily: "Arial, Helvetica, sans-serif",
  boxSizing: "border-box" as const,
};

const exportProductNameSx = (isArabic: boolean) =>
  ({
    fontWeight: 500,
    fontSize: "0.875rem",
    lineHeight: 1.25,
    whiteSpace: "nowrap" as const,
    textAlign: isArabic ? ("right" as const) : ("inherit" as const),
  }) as const;

type TableLabels = {
  product: string;
  quantity: string;
  total: string;
  udvCond: string;
  noLines: string;
};

type VendeurRecapTableProps = {
  group: VendeurRecapGroup;
  magasinColumns: MagasinMxColumn[];
  showTotalColumn?: boolean;
  magasinColumnHeader?: string;
  labels: TableLabels;
};

export function VendeurRecapTable({
  group,
  magasinColumns,
  showTotalColumn = true,
  magasinColumnHeader,
  labels,
}: VendeurRecapTableProps) {
  const colSpan = 2 + magasinColumns.length + (showTotalColumn ? 1 : 0);

  return (
    <Table size="small" sx={exportTableSx}>
      <TableHead>
        <TableRow>
          <TableCell align="right">{labels.product}</TableCell>
          {magasinColumns.map((m) => (
            <TableCell key={m.id} align="center">
              {magasinColumnHeader ?? m.mxCode}
            </TableCell>
          ))}
          {showTotalColumn ? <TableCell align="center">{labels.total}</TableCell> : null}
          <TableCell align="left">{labels.udvCond}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {group.rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan}>{labels.noLines}</TableCell>
          </TableRow>
        ) : (
          group.rows.map((row) => (
            <TableRow key={row.ligneId}>
              <TableCell align="right" sx={{ verticalAlign: "middle" }}>
                {row.productDisplayName ? (
                  <Typography
                    variant="body2"
                    component="div"
                    dir={row.productDisplayIsArabic ? "rtl" : undefined}
                    lang={row.productDisplayIsArabic ? "ar" : undefined}
                    sx={exportProductNameSx(row.productDisplayIsArabic === true)}
                  >
                    {row.productDisplayName}
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      textAlign: "right",
                    }}
                  >
                    {row.nameAr ? (
                      <Typography
                        variant="body2"
                        component="div"
                        dir="rtl"
                        lang="ar"
                        sx={{
                          ...exportProductNameSx(true),
                          fontWeight: 600,
                        }}
                      >
                        {row.nameAr}
                      </Typography>
                    ) : null}
                    <Typography
                      variant="body2"
                      component="div"
                      sx={{
                        ...exportProductNameSx(false),
                        mt: row.nameAr ? 0.25 : 0,
                      }}
                    >
                      {row.productName}
                    </Typography>
                  </Box>
                )}
              </TableCell>
              {row.mags.map((v, i) => {
                const magComment = row.magComments[i]?.trim() ?? "";
                const qtyStr = formatRecapQtyCell(v);
                const hasComment = magComment.length > 0;
                return (
                  <TableCell
                    key={`${row.ligneId}-${i}`}
                    align="center"
                    sx={{ verticalAlign: hasComment ? "top" : "middle" }}
                  >
                    {hasComment ? (
                      <Box
                        sx={{
                          display: "inline-flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 0.25,
                        }}
                      >
                        {qtyStr ? (
                          <Typography
                            variant="body2"
                            component="span"
                            sx={{ lineHeight: 1.3, whiteSpace: "nowrap" }}
                          >
                            {qtyStr}
                          </Typography>
                        ) : null}
                        <Typography
                          variant="caption"
                          component="div"
                          dir="rtl"
                          sx={{
                            lineHeight: 1.25,
                            fontSize: "0.6875rem",
                            color: "text.secondary",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {magComment}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        component="span"
                        sx={{ lineHeight: 1.3, whiteSpace: "nowrap" }}
                      >
                        {qtyStr}
                      </Typography>
                    )}
                  </TableCell>
                );
              })}
              {showTotalColumn ? (
                <TableCell align="center" sx={{ fontWeight: 700, verticalAlign: "middle" }}>
                  {formatRecapQtyCell(row.total)}
                </TableCell>
              ) : null}
              <TableCell align="left">
                <Box sx={{ display: "inline-flex", flexDirection: "column", whiteSpace: "nowrap" }}>
                  <Typography variant="caption" component="div" sx={{ lineHeight: 1.3 }}>
                    {row.udvCond}
                  </Typography>
                  {row.udvCondSub ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                      sx={{ lineHeight: 1.25, mt: 0.25 }}
                    >
                      {row.udvCondSub}
                    </Typography>
                  ) : null}
                </Box>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

type CaptureHeaderProps = {
  magasinHeader: string;
  supplierOrderLine: string;
  vendeurLabel: string;
  showVendeurHeader: boolean;
  orderOnLine: string;
  orderByLine: string | null;
  productCount: string;
  dir?: "rtl" | "ltr";
};

export function VendeurRecapCaptureHeader({
  magasinHeader,
  supplierOrderLine,
  vendeurLabel,
  showVendeurHeader,
  orderOnLine,
  orderByLine,
  productCount,
  dir,
}: CaptureHeaderProps) {
  const parLabel = orderByLine?.trim() ?? "";
  const textDir = dir === "rtl" ? "rtl" : undefined;
  return (
    <>
      {magasinHeader.length > 0 ? (
        <Typography
          variant="subtitle1"
          dir={textDir}
          sx={{ fontWeight: 700, mb: 0.5, whiteSpace: "nowrap", textAlign: dir === "rtl" ? "right" : "inherit" }}
        >
          {magasinHeader}
        </Typography>
      ) : null}
      <Typography
        variant="subtitle1"
        dir={textDir}
        sx={{
          fontWeight: 700,
          mb: 0.5,
          whiteSpace: "nowrap",
          mt: magasinHeader.length > 0 ? 0.5 : 0,
          textAlign: dir === "rtl" ? "right" : "inherit",
        }}
      >
        {supplierOrderLine}
      </Typography>
      {showVendeurHeader ? (
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 700, mb: 0.5, whiteSpace: "nowrap", mt: magasinHeader.length > 0 ? 0.5 : 0 }}
        >
          {vendeurLabel}
        </Typography>
      ) : null}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: parLabel.length > 0 ? 0.25 : 1.5, whiteSpace: "nowrap" }}
      >
        {orderOnLine}
      </Typography>
      {parLabel.length > 0 ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: productCount.length > 0 ? 0.25 : 1.5, whiteSpace: "nowrap" }}
        >
          {parLabel}
        </Typography>
      ) : null}
      {productCount.length > 0 ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ display: "block", mb: 1.5, fontWeight: 600, whiteSpace: "nowrap" }}
        >
          {productCount}
        </Typography>
      ) : null}
    </>
  );
}

export function vendeurHeaderVisible(
  vendeurLabel: string,
  supplierLabel: string,
): boolean {
  const vendeurTrim = vendeurLabel.trim();
  const supplierTrim = supplierLabel.trim();
  return (
    vendeurTrim.length > 0 &&
    vendeurTrim.localeCompare(supplierTrim, "fr", { sensitivity: "accent" }) !== 0
  );
}
