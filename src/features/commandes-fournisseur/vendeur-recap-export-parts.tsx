"use client";

import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { ARABIC_FONT_FAMILY, notoSansArabic } from "@/lib/fonts/noto-sans-arabic";
import {
  formatRecapQtyCell,
  type MagasinMxColumn,
  type LotExportSection,
  type VendeurRecapGroup,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

export const exportTableSx = {
  width: "max-content",
  maxWidth: "none",
  tableLayout: "auto" as const,
  "& .MuiTableCell-root": {
    border: "1px solid #ccc",
    py: 1.5,
    px: 0.75,
    fontSize: "0.8125rem",
    lineHeight: 1.55,
    whiteSpace: "nowrap" as const,
    width: "auto",
    verticalAlign: "middle",
  },
  "& .MuiTableHead-root .MuiTableCell-root": {
    fontWeight: 700,
    bgcolor: "#f5f5f5",
    py: 1,
  },
  "& .MuiTableBody-root .MuiTableRow-root": {
    height: "auto",
  },
};

/** Table dense A4 — largeur = contenu, nombres centrés. */
export const compactExportTableSx = {
  width: "max-content",
  maxWidth: "none",
  tableLayout: "auto" as const,
  "& .MuiTableCell-root": {
    border: "1px solid #ccc",
    py: 0.3,
    px: 0.45,
    fontSize: "0.7rem",
    lineHeight: 1.25,
    whiteSpace: "nowrap" as const,
    width: "auto",
    verticalAlign: "middle",
  },
  "& .MuiTableHead-root .MuiTableCell-root": {
    fontWeight: 700,
    bgcolor: "#f5f5f5",
    py: 0.35,
    fontSize: "0.62rem",
  },
  "& .MuiTableBody-root .MuiTableRow-root": {
    height: "auto",
  },
};

/** Alias : même style (largeur = texte). */
export const compactFitExportTableSx = compactExportTableSx;

export const captureRootSx = {
  display: "inline-block",
  width: "max-content",
  maxWidth: "none",
  background: "#fff",
  p: 2,
  fontFamily: "Arial, Helvetica, sans-serif",
  boxSizing: "border-box" as const,
};

/** Canevas A4 paysage (297 × 210 mm) pour export consolidation. */
export const a4LandscapeCaptureRootSx = {
  display: "flex",
  flexDirection: "column" as const,
  width: "297mm",
  height: "210mm",
  maxWidth: "297mm",
  maxHeight: "210mm",
  overflow: "hidden",
  background: "#fff",
  p: "4mm",
  fontFamily: "Arial, Helvetica, sans-serif",
  boxSizing: "border-box" as const,
};

/** Nombre de colonnes pour tenter de tenir / remplir une page A4 paysage. */
export function consolidationA4ColumnCount(totalRows: number): number {
  if (totalRows <= 12) return 1;
  if (totalRows <= 28) return 2;
  return 3;
}

export const arabicTextSx = {
  fontFamily: ARABIC_FONT_FAMILY,
  fontFeatureSettings: '"liga" 1, "calt" 1',
} as const;

export const arabicTextClassName = notoSansArabic.className;

const exportProductNameSx = (isArabic: boolean, compact = false) =>
  ({
    fontWeight: 500,
    fontSize: compact ? "0.7rem" : "0.875rem",
    lineHeight: compact ? 1.25 : 1.55,
    whiteSpace: "nowrap" as const,
    textAlign: isArabic ? ("right" as const) : ("inherit" as const),
    ...(isArabic ? arabicTextSx : {}),
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
  captureDir?: "rtl" | "ltr";
  compact?: boolean;
  /** Largeur colonnes = contenu (pas 100 %). */
  fitContent?: boolean;
};

export function VendeurRecapTable({
  group,
  magasinColumns,
  showTotalColumn = true,
  magasinColumnHeader,
  labels,
  captureDir = "ltr",
  compact = false,
  fitContent = false,
}: VendeurRecapTableProps) {
  const colSpan = 2 + magasinColumns.length + (showTotalColumn ? 1 : 0);
  const headerArabicSx = captureDir === "rtl" ? arabicTextSx : {};
  const tableSx = compact ? compactExportTableSx : exportTableSx;

  return (
    <Table size="small" sx={tableSx} dir={captureDir}>
      <TableHead>
        <TableRow>
          <TableCell
            align="right"
            dir={captureDir === "rtl" ? "rtl" : undefined}
            lang={captureDir === "rtl" ? "ar" : undefined}
            sx={headerArabicSx}
          >
            {labels.product}
          </TableCell>
          {magasinColumns.map((m) => (
            <TableCell key={m.id} align="center" sx={{ px: compact ? 0.45 : undefined }}>
              {magasinColumnHeader ?? m.mxCode}
            </TableCell>
          ))}
          {showTotalColumn ? (
            <TableCell
              align="center"
              dir={captureDir === "rtl" ? "rtl" : undefined}
              lang={captureDir === "rtl" ? "ar" : undefined}
              sx={{ ...headerArabicSx, px: compact ? 0.45 : undefined }}
            >
              {labels.total}
            </TableCell>
          ) : null}
          <TableCell
            align="left"
            dir={captureDir === "rtl" ? "rtl" : undefined}
            lang={captureDir === "rtl" ? "ar" : undefined}
            sx={headerArabicSx}
          >
            {labels.udvCond}
          </TableCell>
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
                    className={row.productDisplayIsArabic ? arabicTextClassName : undefined}
                    dir={row.productDisplayIsArabic ? "rtl" : undefined}
                    lang={row.productDisplayIsArabic ? "ar" : undefined}
                    sx={exportProductNameSx(row.productDisplayIsArabic === true, compact)}
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
                        className={arabicTextClassName}
                        dir="rtl"
                        lang="ar"
                        sx={{
                          ...exportProductNameSx(true, compact),
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
                        ...exportProductNameSx(false, compact),
                        mt: row.nameAr ? (compact ? 0.15 : 0.5) : 0,
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
                    sx={{
                      verticalAlign: hasComment ? "top" : "middle",
                      px: compact ? 0.45 : undefined,
                      textAlign: "center",
                    }}
                  >
                    {hasComment ? (
                      <Box
                        sx={{
                          display: "inline-flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: compact ? 0.2 : 0.5,
                          py: compact ? 0 : 0.25,
                          width: "100%",
                        }}
                      >
                        {qtyStr ? (
                          <Typography
                            variant="body2"
                            component="span"
                            className="tabular-nums"
                            sx={{
                              lineHeight: 1.25,
                              whiteSpace: "nowrap",
                              textAlign: "center",
                              fontSize: compact ? "0.7rem" : undefined,
                            }}
                          >
                            {qtyStr}
                          </Typography>
                        ) : null}
                        <Typography
                          variant="caption"
                          component="div"
                          className={arabicTextClassName}
                          dir="rtl"
                          lang="ar"
                          sx={{
                            lineHeight: 1.2,
                            fontSize: compact ? "0.65rem" : "0.6875rem",
                            color: "text.secondary",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            ...arabicTextSx,
                          }}
                        >
                          {magComment}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        component="span"
                        className="tabular-nums"
                        sx={{
                          display: "block",
                          lineHeight: 1.25,
                          whiteSpace: "nowrap",
                          textAlign: "center",
                          fontSize: compact ? "0.7rem" : undefined,
                        }}
                      >
                        {qtyStr}
                      </Typography>
                    )}
                  </TableCell>
                );
              })}
              {showTotalColumn ? (
                <TableCell
                  align="center"
                  className="tabular-nums"
                  sx={{
                    fontWeight: 700,
                    verticalAlign: "middle",
                    fontSize: compact ? "0.7rem" : undefined,
                    px: compact ? 0.45 : undefined,
                    textAlign: "center",
                  }}
                >
                  {formatRecapQtyCell(row.total)}
                </TableCell>
              ) : null}
              <TableCell align="left">
                <Box
                  sx={{
                    display: "inline-flex",
                    flexDirection: "column",
                    whiteSpace: "nowrap",
                    gap: compact ? 0.15 : 0.35,
                  }}
                >
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{ lineHeight: 1.25, fontSize: compact ? "0.62rem" : undefined }}
                  >
                    {row.udvCond}
                  </Typography>
                  {row.udvCondSub ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                      sx={{ lineHeight: 1.25, fontSize: compact ? "0.65rem" : undefined }}
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
  vendeurLabel: string;
  showVendeurHeader: boolean;
  orderOnLine: string;
  orderByLine: string | null;
  productCount: string;
  dir?: "rtl" | "ltr";
};

export function VendeurRecapCaptureHeader({
  magasinHeader,
  vendeurLabel,
  showVendeurHeader,
  orderOnLine,
  orderByLine,
  productCount,
  dir,
}: CaptureHeaderProps) {
  const parLabel = orderByLine?.trim() ?? "";
  const textDir = dir === "rtl" ? "rtl" : undefined;
  const headerArabicSx = dir === "rtl" ? arabicTextSx : {};
  return (
    <>
      {magasinHeader.length > 0 ? (
        <Typography
          variant="subtitle1"
          dir={textDir}
          lang={dir === "rtl" ? "ar" : undefined}
          className={dir === "rtl" ? arabicTextClassName : undefined}
          sx={{
            fontWeight: 700,
            mb: 0.5,
            whiteSpace: "nowrap",
            textAlign: dir === "rtl" ? "right" : "inherit",
            ...headerArabicSx,
          }}
        >
          {magasinHeader}
        </Typography>
      ) : null}
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
        dir={textDir}
        lang={dir === "rtl" ? "ar" : undefined}
        className={dir === "rtl" ? arabicTextClassName : undefined}
        sx={{
          display: "block",
          mb: parLabel.length > 0 ? 0.25 : 1.5,
          whiteSpace: "nowrap",
          ...headerArabicSx,
        }}
      >
        {orderOnLine}
      </Typography>
      {parLabel.length > 0 ? (
        <Typography
          variant="caption"
          color="text.secondary"
          dir={textDir}
          lang={dir === "rtl" ? "ar" : undefined}
          className={dir === "rtl" ? arabicTextClassName : undefined}
          sx={{
            display: "block",
            mb: productCount.length > 0 ? 0.25 : 1.5,
            whiteSpace: "nowrap",
            ...headerArabicSx,
          }}
        >
          {parLabel}
        </Typography>
      ) : null}
      {productCount.length > 0 ? (
        <Typography
          variant="body2"
          color="text.secondary"
          dir={textDir}
          lang={dir === "rtl" ? "ar" : undefined}
          className={dir === "rtl" ? arabicTextClassName : undefined}
          sx={{
            display: "block",
            mb: 1.5,
            fontWeight: 600,
            whiteSpace: "nowrap",
            ...headerArabicSx,
          }}
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

type LotGroupedRecapTableProps = {
  sections: LotExportSection[];
  magasinColumns: MagasinMxColumn[];
  labels: TableLabels;
  captureDir?: "rtl" | "ltr";
  showTotalColumn?: boolean;
  compact?: boolean;
  columnCount?: number;
  /**
   * `sections` : un bloc par section (vendeur), sans coupure.
   * `category-flow` : une catégorie peut s’étaler sur plusieurs colonnes (nom répété) ; largeurs = texte.
   */
  layout?: "sections" | "category-flow";
};

export type CategoryColumnFragment = {
  label: string;
  rows: LotExportSection["rows"];
};

/** Répartit les lignes produit sur N colonnes ; répète le libellé catégorie en tête de chaque fragment. */
export function packSectionsIntoColumns(
  sections: LotExportSection[],
  columnCount: number,
): CategoryColumnFragment[][] {
  const cols = Math.max(1, Math.min(3, columnCount));
  type Unit = { label: string; row: LotExportSection["rows"][number] };
  const units: Unit[] = [];
  for (const section of sections) {
    for (const row of section.rows) {
      units.push({ label: section.label, row });
    }
  }

  if (units.length === 0) {
    return Array.from({ length: cols }, () => []);
  }

  if (cols === 1) {
    return [
      sections.map((s) => ({
        label: s.label,
        rows: s.rows,
      })),
    ];
  }

  const total = units.length;
  const base = Math.floor(total / cols);
  const rem = total % cols;
  const result: CategoryColumnFragment[][] = Array.from({ length: cols }, () => []);
  let ui = 0;
  for (let c = 0; c < cols; c++) {
    const take = base + (c < rem ? 1 : 0);
    const slice = units.slice(ui, ui + take);
    ui += take;
    let current: CategoryColumnFragment | null = null;
    for (const u of slice) {
      if (!current || current.label !== u.label) {
        current = { label: u.label, rows: [u.row] };
        result[c]!.push(current);
      } else {
        current.rows.push(u.row);
      }
    }
  }
  return result;
}

/** Répartit des sections entières sur N colonnes (sans couper une section). */
export function packWholeSectionsIntoColumns(
  sections: LotExportSection[],
  columnCount: number,
): LotExportSection[][] {
  const cols = Math.max(1, Math.min(3, columnCount));
  if (cols === 1 || sections.length === 0) {
    return [sections];
  }
  const result: LotExportSection[][] = Array.from({ length: cols }, () => []);
  const weights = Array.from({ length: cols }, () => 0);
  for (const section of sections) {
    let best = 0;
    for (let i = 1; i < cols; i++) {
      if ((weights[i] ?? 0) < (weights[best] ?? 0)) {
        best = i;
      }
    }
    result[best]!.push(section);
    weights[best] = (weights[best] ?? 0) + section.rows.length + 1;
  }
  return result.filter((col) => col.length > 0);
}

function CategorySectionHeader({
  label,
  captureDir,
  compact,
}: {
  label: string;
  captureDir: "rtl" | "ltr";
  compact: boolean;
}) {
  return (
    <Typography
      variant="subtitle1"
      dir={captureDir === "rtl" ? "rtl" : undefined}
      lang={captureDir === "rtl" ? "ar" : undefined}
      className={captureDir === "rtl" ? arabicTextClassName : undefined}
      sx={{
        fontWeight: 700,
        color: "success.main",
        bgcolor: "#e8f5e9",
        px: compact ? 0.5 : 1,
        py: compact ? 0.35 : 0.75,
        mb: compact ? 0.35 : 0.5,
        whiteSpace: "nowrap",
        width: "max-content",
        maxWidth: "100%",
        fontSize: compact ? "0.72rem" : undefined,
        textAlign: captureDir === "rtl" ? "right" : "inherit",
        ...(captureDir === "rtl" ? arabicTextSx : {}),
      }}
    >
      {label}
    </Typography>
  );
}

export function LotGroupedRecapTable({
  sections,
  magasinColumns,
  labels,
  captureDir = "ltr",
  showTotalColumn = true,
  compact = false,
  columnCount = 1,
  layout = "sections",
}: LotGroupedRecapTableProps) {
  const cols = Math.max(1, Math.min(3, columnCount));

  if (layout === "category-flow") {
    const packed = packSectionsIntoColumns(sections, cols);
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: captureDir === "rtl" ? "row-reverse" : "row",
          alignItems: "flex-start",
          gap: "3mm",
          width: "max-content",
          maxWidth: "100%",
        }}
      >
        {packed.map((fragments, colIdx) => (
          <Box
            key={`col-${colIdx}`}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: captureDir === "rtl" ? "flex-end" : "flex-start",
              gap: compact ? 0.75 : 1.5,
              flex: "0 0 auto",
            }}
          >
            {fragments.map((frag, fragIdx) => (
              <Box key={`${frag.label}-${colIdx}-${fragIdx}`} sx={{ width: "max-content" }}>
                <CategorySectionHeader label={frag.label} captureDir={captureDir} compact={compact} />
                <VendeurRecapTable
                  group={{
                    vendeurKey: `${frag.label}-${colIdx}-${fragIdx}`,
                    vendeurLabel: frag.label,
                    rows: frag.rows,
                  }}
                  magasinColumns={magasinColumns}
                  showTotalColumn={showTotalColumn}
                  labels={labels}
                  captureDir={captureDir}
                  compact={compact}
                  fitContent
                />
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    );
  }

  const sectionsPacked = packWholeSectionsIntoColumns(sections, cols);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: captureDir === "rtl" ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: "3mm",
        width: "max-content",
        maxWidth: "100%",
      }}
    >
      {sectionsPacked.map((colSections, colIdx) => (
        <Box
          key={`vend-col-${colIdx}`}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: captureDir === "rtl" ? "flex-end" : "flex-start",
            gap: compact ? 0.85 : 1.5,
            flex: "0 0 auto",
          }}
        >
          {colSections.map((section) => (
            <Box key={section.label} sx={{ width: "max-content" }}>
              <CategorySectionHeader label={section.label} captureDir={captureDir} compact={compact} />
              <VendeurRecapTable
                group={{ vendeurKey: section.label, vendeurLabel: section.label, rows: section.rows }}
                magasinColumns={magasinColumns}
                showTotalColumn={showTotalColumn}
                labels={labels}
                captureDir={captureDir}
                compact={compact}
                fitContent
              />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
