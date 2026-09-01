"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { PaiementRecapData } from "@/lib/commandes-fournisseur/paiement-recap";
import { paiementRecapCaptureLabels } from "@/lib/commandes-fournisseur/paiement-recap-capture-i18n";
import {
  arabicTextSx,
  arabicTextClassName,
  captureRootSx,
  exportTableSx,
} from "@/features/commandes-fournisseur/vendeur-recap-export-parts";
import {
  captureElementToPngFile,
  downloadPngFileUnique,
  vendorWhatsAppHref,
} from "@/lib/commandes-fournisseur/export-element-png";
import { useAppFormat } from "@/lib/i18n/useAppFormat";

export type PaiementRecapExportHandle = {
  downloadRecap: (paiementId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  sendWhatsApp: (paiementId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function recapFilename(recap: PaiementRecapData): string {
  const slug = recap.account_label.replace(/[^\w\u0600-\u06FF\-]+/g, "_").slice(0, 40);
  return `paiement-${recap.date_paiement}-${slug}.png`;
}

function PaiementRecapCaptureContent({
  recap,
  formatDate,
}: {
  recap: PaiementRecapData;
  formatDate: (iso: string) => string;
}) {
  const labels = useMemo(
    () => paiementRecapCaptureLabels(recap.export_locale),
    [recap.export_locale],
  );
  const comment = recap.commentaire?.trim() ?? "";
  const isRtl = labels.dir === "rtl";

  return (
    <Box
      dir={labels.dir}
      lang={isRtl ? "ar" : undefined}
      style={{ direction: labels.dir }}
      sx={captureRootSx}
    >
      <Typography
        variant="h6"
        dir={isRtl ? "rtl" : undefined}
        className={isRtl ? arabicTextClassName : undefined}
        sx={{
          fontWeight: 700,
          mb: 1.5,
          whiteSpace: "nowrap",
          ...(isRtl ? arabicTextSx : {}),
        }}
      >
        {labels.title}
      </Typography>

      <Typography variant="body2" sx={{ mb: 0.5, whiteSpace: "nowrap" }} dir={isRtl ? "rtl" : undefined}>
        <Box component="span" sx={{ fontWeight: 700 }}>
          {labels.account}
        </Box>
        {" : "}
        {recap.account_label}
      </Typography>

      {recap.parent_supplier_label ? (
        <Typography variant="body2" sx={{ mb: 0.5, whiteSpace: "nowrap" }} dir={isRtl ? "rtl" : undefined}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            {labels.supplier}
          </Box>
          {" : "}
          {recap.parent_supplier_label}
        </Typography>
      ) : null}

      <Typography variant="body2" sx={{ mb: 0.5, whiteSpace: "nowrap" }} dir={isRtl ? "rtl" : undefined}>
        <Box component="span" sx={{ fontWeight: 700 }}>
          {labels.paymentDate}
        </Box>
        {" : "}
        {recap.date_paiement}
      </Typography>

      <Typography variant="body2" sx={{ mb: 0.5, whiteSpace: "nowrap" }} dir={isRtl ? "rtl" : undefined}>
        <Box component="span" sx={{ fontWeight: 700 }}>
          {labels.method}
        </Box>
        {" : "}
        {recap.payment_method_label}
      </Typography>

      <Typography variant="body1" sx={{ mb: 1.5, fontWeight: 700, whiteSpace: "nowrap" }} dir={isRtl ? "rtl" : undefined}>
        {labels.amount} : {formatDh(recap.montant)} DH
      </Typography>

      <Typography
        variant="subtitle2"
        sx={{ mb: 0.75, fontWeight: 700, whiteSpace: "nowrap" }}
        dir={isRtl ? "rtl" : undefined}
      >
        {labels.achatsTitle}
      </Typography>

      <Table size="small" sx={exportTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>{labels.achatDate}</TableCell>
            <TableCell align="right">{labels.achatAmount}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {recap.achats.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{formatDate(a.date_cloture)}</TableCell>
              <TableCell align="right">{formatDh(a.montant_total)} DH</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {comment ? (
        <Typography
          variant="caption"
          component="p"
          className={isRtl ? `!mt-2 ${arabicTextClassName}` : "!mt-2"}
          dir={isRtl ? "rtl" : undefined}
          sx={{
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
            maxWidth: "none",
            ...(isRtl ? arabicTextSx : {}),
          }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            {labels.comment}
          </Box>
          {" : "}
          {comment}
        </Typography>
      ) : null}
    </Box>
  );
}

const PaiementRecapExporter = forwardRef<PaiementRecapExportHandle>(function PaiementRecapExporter(_, ref) {
  const { formatDate } = useAppFormat();
  const captureRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<(() => void) | null>(null);
  const [recap, setRecap] = useState<PaiementRecapData | null>(null);

  useEffect(() => {
    if (!recap || !readyRef.current) return;
    const done = readyRef.current;
    readyRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        done();
      });
    });
  }, [recap]);

  const loadRecap = useCallback(async (paiementId: string): Promise<PaiementRecapData> => {
    const res = await fetch(
      `/api/commandes-fournisseur/comptes/paiements/${encodeURIComponent(paiementId)}/recap`,
    );
    const json = (await res.json()) as { recap?: PaiementRecapData; error?: string };
    if (!res.ok || !json.recap) {
      throw new Error(typeof json.error === "string" ? json.error : "Chargement récap impossible");
    }
    return json.recap;
  }, []);

  const waitForRender = useCallback(async (data: PaiementRecapData) => {
    await new Promise<void>((resolve) => {
      readyRef.current = resolve;
      setRecap(data);
    });
  }, []);

  const captureCurrent = useCallback(async (data: PaiementRecapData) => {
    const el = captureRef.current;
    if (!el) {
      return { ok: false as const, error: "Élément de capture introuvable" };
    }
    const filename = recapFilename(data);
    const captured = await captureElementToPngFile(el, filename);
    if (!captured.ok) {
      return captured;
    }
    return { ok: true as const, file: captured.file, filename };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      downloadRecap: async (paiementId) => {
        try {
          const data = await loadRecap(paiementId);
          await waitForRender(data);
          const result = await captureCurrent(data);
          if (!result.ok) return result;
          downloadPngFileUnique(result.file, result.filename);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Erreur export" };
        }
      },
      sendWhatsApp: async (paiementId) => {
        try {
          const data = await loadRecap(paiementId);
          const href = data.whatsapp_phone ? vendorWhatsAppHref(data.whatsapp_phone) : null;
          if (!href) {
            return { ok: false, error: "Numéro WhatsApp indisponible pour ce compte" };
          }
          await waitForRender(data);
          const result = await captureCurrent(data);
          if (!result.ok) return result;
          downloadPngFileUnique(result.file, result.filename);
          window.open(href, "_blank", "noopener,noreferrer");
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Erreur export" };
        }
      },
    }),
    [captureCurrent, loadRecap, waitForRender],
  );

  return (
    <Box
      aria-hidden
      sx={{
        position: "fixed",
        left: -10000,
        top: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <Box ref={captureRef}>
        {recap ? <PaiementRecapCaptureContent recap={recap} formatDate={formatDate} /> : null}
      </Box>
    </Box>
  );
});

export default PaiementRecapExporter;
