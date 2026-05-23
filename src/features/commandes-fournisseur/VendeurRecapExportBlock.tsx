"use client";

import { useCallback, useRef, useState } from "react";
import { Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { exportElementAsPng } from "@/lib/commandes-fournisseur/export-element-png";
import {
  formatRecapQtyCell,
  type MagasinMxColumn,
  type VendeurRecapGroup,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

const exportTableSx = {
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

const captureRootSx = {
  display: "inline-block",
  width: "max-content",
  maxWidth: "none",
  background: "#fff",
  p: 2,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box" as const,
};

type Props = {
  group: VendeurRecapGroup;
  magasinColumns: MagasinMxColumn[];
  supplierLabel: string;
  commandeDateLabel: string;
  commandeDateSlug: string;
  /** Commentaire lot ou commande affiché sous le tableau. */
  footerComment?: string | null;
  footerCommentLabel?: string;
  /** Masque l’aperçu tableau à l’écran (export seul). */
  hideTablePreview?: boolean;
  /** Colonne Total (plusieurs magasins lot validation). */
  showTotalColumn?: boolean;
  /** En-tête des colonnes magasin (ex. « Quantité » au lieu de MXX). */
  magasinColumnHeader?: string;
  /** En-tête image : nom du magasin (commande saisie). */
  headerMagasinName?: string | null;
  /** Sous la date : « par {utilisateur} ». */
  commandeParLabel?: string | null;
};

export default function VendeurRecapExportBlock({
  group,
  magasinColumns,
  supplierLabel,
  commandeDateLabel,
  commandeDateSlug,
  footerComment,
  footerCommentLabel = "Commentaire lot",
  hideTablePreview = false,
  showTotalColumn = true,
  magasinColumnHeader,
  headerMagasinName,
  commandeParLabel,
}: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    const el = captureRef.current;
    if (!el) {
      return;
    }
    setExporting(true);
    setExportErr(null);
    const filename = `commande-${commandeDateSlug}-${supplierLabel}-${group.vendeurLabel}.png`;
    const result = await exportElementAsPng(el, filename);
    if (!result.ok) {
      setExportErr(result.error);
    }
    setExporting(false);
  }, [commandeDateSlug, group.vendeurLabel, supplierLabel]);

  const colSpan = 2 + magasinColumns.length + (showTotalColumn ? 1 : 0);
  const footer = footerComment?.trim() ?? "";
  const magasinHeader = headerMagasinName?.trim() ?? "";
  const supplierTrim = supplierLabel.trim();
  const vendeurTrim = group.vendeurLabel.trim();
  const showVendeurHeader =
    vendeurTrim.length > 0 &&
    vendeurTrim.localeCompare(supplierTrim, "fr", { sensitivity: "accent" }) !== 0;
  const parLabel = commandeParLabel?.trim() ?? "";

  const captureContent = (
    <Box ref={captureRef} sx={captureRootSx}>
      {magasinHeader.length > 0 ? (
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, whiteSpace: "nowrap" }}>
          {magasinHeader}
        </Typography>
      ) : null}
      {magasinHeader.length > 0 ? (
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, whiteSpace: "nowrap" }}>
          Commande Fournisseur : {supplierLabel}
        </Typography>
      ) : null}
      {showVendeurHeader ? (
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 700, mb: 0.5, whiteSpace: "nowrap", mt: magasinHeader.length > 0 ? 0.5 : 0 }}
        >
          {group.vendeurLabel}
        </Typography>
      ) : null}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: parLabel.length > 0 ? 0.25 : 1.5, whiteSpace: "nowrap" }}
      >
        Commande du {commandeDateLabel}
      </Typography>
      {parLabel.length > 0 ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 1.5, whiteSpace: "nowrap" }}
        >
          par {parLabel}
        </Typography>
      ) : null}
      <Table size="small" sx={exportTableSx}>
        <TableHead>
          <TableRow>
            <TableCell align="right">Produit</TableCell>
            {magasinColumns.map((m) => (
              <TableCell key={m.id} align="right">
                {magasinColumnHeader ?? m.mxCode}
              </TableCell>
            ))}
            {showTotalColumn ? <TableCell align="right">Total</TableCell> : null}
            <TableCell align="left">UdV / cond.</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {group.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan}>Aucune ligne</TableCell>
            </TableRow>
          ) : (
            group.rows.map((row) => (
              <TableRow key={row.ligneId}>
                <TableCell align="right" sx={{ verticalAlign: "middle" }}>
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
                        sx={{
                          fontSize: "1rem",
                          fontWeight: 600,
                          lineHeight: 1.35,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.nameAr}
                      </Typography>
                    ) : null}
                    <Typography
                      variant="body2"
                      component="div"
                      sx={{
                        fontWeight: 500,
                        lineHeight: 1.3,
                        mt: row.nameAr ? 0.25 : 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.productName}
                    </Typography>
                  </Box>
                </TableCell>
                {row.mags.map((v, i) => {
                  const magComment = row.magComments[i]?.trim() ?? "";
                  const qtyStr = formatRecapQtyCell(v);
                  const hasComment = magComment.length > 0;
                  return (
                    <TableCell
                      key={`${row.ligneId}-${i}`}
                      align="right"
                      sx={{ verticalAlign: hasComment ? "top" : "middle" }}
                    >
                      {hasComment ? (
                        <Box
                          sx={{
                            display: "inline-flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
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
                              textAlign: "right",
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
                  <TableCell align="right" sx={{ fontWeight: 700, verticalAlign: "middle" }}>
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
      {footer ? (
        <Typography
          variant="caption"
          component="p"
          className="!mt-2"
          sx={{ lineHeight: 1.4, whiteSpace: "nowrap", maxWidth: "none" }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            {footerCommentLabel}
          </Box>
          {" : "}
          {footer}
        </Typography>
      ) : null}
    </Box>
  );

  return (
    <Box className={hideTablePreview ? "!mb-3" : "!mb-8"}>
      <div className="!mb-2 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outlined"
          size="small"
          startIcon={<ImageOutlinedIcon />}
          disabled={exporting || group.rows.length === 0}
          onClick={() => void onExport()}
          sx={{ textTransform: "none" }}
        >
          {exporting ? "…" : "Exporter en image"}
        </Button>
      </div>
      {exportErr ? (
        <Typography color="error" variant="body2" className="!mb-2">
          {exportErr}
        </Typography>
      ) : null}

      {hideTablePreview ? (
        <Box
          aria-hidden
          sx={{
            position: "fixed",
            left: -10000,
            top: 0,
            pointerEvents: "none",
            opacity: 0,
            overflow: "hidden",
          }}
        >
          {captureContent}
        </Box>
      ) : (
        <Box className="max-w-full overflow-x-auto" sx={{ display: "inline-block" }}>
          {captureContent}
        </Box>
      )}
    </Box>
  );
}
