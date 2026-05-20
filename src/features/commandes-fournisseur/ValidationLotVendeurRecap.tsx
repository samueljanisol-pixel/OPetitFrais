"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { exportElementAsPng } from "@/lib/commandes-fournisseur/export-element-png";
import {
  buildMagasinMxColumnsFromLot,
  buildVendeurRecapGroups,
  formatRecapQtyCell,
  type MagasinMxColumn,
  type RecapLigneInput,
  type VendeurRecapGroup,
  type VendeurRef,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

type LotForRecap = {
  commentaire?: string | null;
  commande_fournisseur_lot_inclusion?: {
    commande_fournisseur?: {
      magasin_id?: string;
      magasins?: { code?: string | null } | { code?: string | null }[] | null;
    } | null;
  }[];
};

type Props = {
  lot: LotForRecap;
  supplierLabel: string;
  commandeDateLabel: string;
  commandeDateSlug: string;
  lignes: RecapLigneInput[];
  vendeurs: VendeurRef[];
};

function VendeurExportBlock({
  group,
  magasinColumns,
  supplierLabel,
  commandeDateLabel,
  commandeDateSlug,
  lotCommentaire,
}: {
  group: VendeurRecapGroup;
  magasinColumns: MagasinMxColumn[];
  supplierLabel: string;
  commandeDateLabel: string;
  commandeDateSlug: string;
  lotCommentaire: string | null;
}) {
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

  const colSpan = 2 + magasinColumns.length + 2;
  const lotComment = lotCommentaire?.trim() ?? "";

  return (
    <Box className="!mb-8">
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

      <div className="overflow-x-auto">
        <div
          ref={captureRef}
          style={{
            display: "inline-block",
            minWidth: "100%",
            background: "#fff",
            padding: 16,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {group.vendeurLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Commande du {commandeDateLabel}
          </Typography>
          <Table
            size="small"
            sx={{
              "& .MuiTableCell-root": {
                border: "1px solid #ccc",
                py: 0.65,
                px: 0.75,
                fontSize: "0.8125rem",
              },
              "& .MuiTableHead-root .MuiTableCell-root": {
                fontWeight: 700,
                bgcolor: "#f5f5f5",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell align="right" sx={{ minWidth: 140 }}>
                  Produit
                </TableCell>
                {magasinColumns.map((m) => (
                  <TableCell key={m.id} align="right" sx={{ minWidth: 44 }}>
                    {m.mxCode}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ minWidth: 48 }}>
                  Total
                </TableCell>
                <TableCell sx={{ minWidth: 100 }}>UdV / cond.</TableCell>
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
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          textAlign: "right",
                          width: "100%",
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
                          }}
                        >
                          {row.productName}
                        </Typography>
                      </Box>
                    </TableCell>
                    {row.mags.map((v, i) => {
                      const magComment = row.magComments[i]?.trim() ?? "";
                      const qtyStr = formatRecapQtyCell(v);
                      return (
                        <TableCell
                          key={`${row.ligneId}-${i}`}
                          align="right"
                          sx={{ verticalAlign: "top", minWidth: 52 }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              justifyContent: "space-between",
                              minHeight: magComment ? 40 : undefined,
                              width: "100%",
                            }}
                          >
                            {qtyStr ? (
                              <Typography variant="body2" component="span" sx={{ lineHeight: 1.3 }}>
                                {qtyStr}
                              </Typography>
                            ) : (
                              <span />
                            )}
                            {magComment ? (
                              <Typography
                                variant="caption"
                                component="div"
                                dir="rtl"
                                className="whitespace-pre-wrap"
                                sx={{
                                  mt: 0.5,
                                  lineHeight: 1.25,
                                  fontSize: "0.6875rem",
                                  color: "text.secondary",
                                  textAlign: "right",
                                  maxWidth: "100%",
                                }}
                              >
                                {magComment}
                              </Typography>
                            ) : null}
                          </Box>
                        </TableCell>
                      );
                    })}
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatRecapQtyCell(row.total)}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {lotComment ? (
            <Typography
              variant="caption"
              component="p"
              className="!mt-2 whitespace-pre-wrap"
              sx={{ lineHeight: 1.4 }}
            >
              <Box component="span" sx={{ fontWeight: 700 }}>
                Commentaire lot
              </Box>
              {" : "}
              {lotComment}
            </Typography>
          ) : null}
        </div>
      </div>
    </Box>
  );
}

export default function ValidationLotVendeurRecap({
  lot,
  supplierLabel,
  commandeDateLabel,
  commandeDateSlug,
  lignes,
  vendeurs,
}: Props) {
  const magasinColumns = useMemo(() => buildMagasinMxColumnsFromLot(lot), [lot]);
  const lotCommentaire = typeof lot.commentaire === "string" ? lot.commentaire : null;
  const groups = useMemo(
    () => buildVendeurRecapGroups(lignes, vendeurs, magasinColumns),
    [lignes, vendeurs, magasinColumns],
  );

  if (groups.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" className="!mb-4">
        Aucune ligne pour le récap vendeurs.
      </Typography>
    );
  }

  return (
    <div className="!mb-6">
      <Typography variant="subtitle1" className="!mb-3" sx={{ fontWeight: 600 }}>
        Récapitulatif par vendeur
      </Typography>
      {groups.map((g) => (
        <VendeurExportBlock
          key={g.vendeurKey}
          group={g}
          magasinColumns={magasinColumns}
          supplierLabel={supplierLabel}
          commandeDateLabel={commandeDateLabel}
          commandeDateSlug={commandeDateSlug}
          lotCommentaire={lotCommentaire}
        />
      ))}
    </div>
  );
}
