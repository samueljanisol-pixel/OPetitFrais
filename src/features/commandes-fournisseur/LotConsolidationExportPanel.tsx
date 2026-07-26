"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import { Box, Button, Typography } from "@mui/material";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { useTranslations } from "next-intl";
import AppLink from "@/components/AppLink";
import {
  captureElementToPngFile,
  downloadPngFileUnique,
  exportElementAsPng,
  vendorWhatsAppHref,
} from "@/lib/commandes-fournisseur/export-element-png";
import type { ChauffeurProfile } from "@/lib/ref/chauffeur-setting";
import { vendorRecapCaptureLabels } from "@/lib/commandes-fournisseur/vendor-recap-capture-i18n";
import {
  buildCategoryExportSections,
  buildVendeurExportSections,
  type LotExportSection,
  type MagasinMxColumn,
  type RecapLigneInput,
  type VendeurRef,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";
import {
  captureRootSx,
  LotGroupedRecapTable,
  VendeurRecapCaptureHeader,
} from "@/features/commandes-fournisseur/vendeur-recap-export-parts";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/url";

type Props = {
  lignes: RecapLigneInput[];
  vendeurs: VendeurRef[];
  magasinColumns: MagasinMxColumn[];
  supplierLabel: string;
  commandeDateLabel: string;
  commandeDateSlug: string;
  lotComment?: string | null;
  noCategoryLabel: string;
  productCountLabel: string;
};

function CapturePane({
  captureRef,
  sections,
  captureLabels,
  productCount,
  magasinColumns,
  tableLabels,
  footer,
  lotCommentExportLabel,
}: {
  captureRef: RefObject<HTMLDivElement | null>;
  sections: LotExportSection[];
  captureLabels: ReturnType<typeof vendorRecapCaptureLabels>;
  productCount: string;
  magasinColumns: MagasinMxColumn[];
  tableLabels: {
    product: string;
    quantity: string;
    total: string;
    udvCond: string;
    noLines: string;
  };
  footer: string;
  lotCommentExportLabel: string;
}) {
  return (
    <Box ref={captureRef} sx={{ ...captureRootSx, display: "inline-block" }}>
      <VendeurRecapCaptureHeader
        magasinHeader=""
        vendeurLabel=""
        showVendeurHeader={false}
        orderOnLine={captureLabels.orderOnLine}
        orderByLine={captureLabels.orderByLine}
        productCount={productCount}
        dir={captureLabels.dir}
      />
      <LotGroupedRecapTable
        sections={sections}
        magasinColumns={magasinColumns}
        labels={tableLabels}
        captureDir={captureLabels.dir}
      />
      {footer ? (
        <Typography
          variant="caption"
          component="p"
          className="!mt-2"
          sx={{ lineHeight: 1.4, whiteSpace: "nowrap", maxWidth: "none" }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            {lotCommentExportLabel}
          </Box>
          {" : "}
          {footer}
        </Typography>
      ) : null}
    </Box>
  );
}

export default function LotConsolidationExportPanel({
  lignes,
  vendeurs,
  magasinColumns,
  supplierLabel,
  commandeDateLabel,
  commandeDateSlug,
  lotComment,
  noCategoryLabel,
  productCountLabel,
}: Props) {
  const t = useTranslations("backoffice.commandes.validation.lotDetail.consolidationExport");
  const tc = useTranslations("backoffice.commandes.common");

  const categoryCaptureRef = useRef<HTMLDivElement>(null);
  const vendeurCaptureRef = useRef<HTMLDivElement>(null);
  const categoryPngRef = useRef<File | null>(null);
  const vendeurPngRef = useRef<File | null>(null);

  const [exportingCategory, setExportingCategory] = useState(false);
  const [exportingVendeur, setExportingVendeur] = useState(false);
  const [whatsAppBusy, setWhatsAppBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [chauffeur, setChauffeur] = useState<ChauffeurProfile | null>(null);
  const [chauffeurLoading, setChauffeurLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ref/chauffeur", { credentials: "include" })
      .then(async (res) => {
        const j = (await res.json()) as { chauffeur?: ChauffeurProfile | null; error?: string };
        if (!cancelled) {
          if (res.ok) {
            setChauffeur(j.chauffeur ?? null);
          }
          setChauffeurLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChauffeurLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const captureLabels = useMemo(
    () => vendorRecapCaptureLabels("fr", supplierLabel, commandeDateLabel, null),
    [supplierLabel, commandeDateLabel],
  );

  const categorySections = useMemo(
    () => buildCategoryExportSections(lignes, magasinColumns, noCategoryLabel),
    [lignes, magasinColumns, noCategoryLabel],
  );

  const vendeurSections = useMemo(
    () => buildVendeurExportSections(lignes, vendeurs, magasinColumns, supplierLabel),
    [lignes, vendeurs, magasinColumns, supplierLabel],
  );

  const categoryFilename = useMemo(
    () => `commande-${commandeDateSlug}-${supplierLabel}-par-categorie.png`,
    [commandeDateSlug, supplierLabel],
  );

  const vendeurFilename = useMemo(
    () => `commande-${commandeDateSlug}-${supplierLabel}-par-vendeur.png`,
    [commandeDateSlug, supplierLabel],
  );

  const tableLabels = useMemo(
    () => ({
      product: captureLabels.product,
      quantity: tc("quantity"),
      total: captureLabels.total,
      udvCond: captureLabels.udvCond,
      noLines: captureLabels.noLines,
    }),
    [captureLabels, tc],
  );

  const footer = lotComment?.trim() ?? "";
  const productCount = productCountLabel.trim();
  const rowsEmpty = lignes.length === 0;
  const lotCommentExportLabel = t("lotCommentExportLabel");

  const chauffeurPhone = chauffeur?.phone?.trim() ?? "";

  const whatsAppHref = useMemo(() => {
    return chauffeurPhone.length > 0 ? vendorWhatsAppHref(chauffeurPhone) : null;
  }, [chauffeurPhone]);

  const phoneOk = normalizeWhatsAppPhone(chauffeurPhone) !== null;

  useEffect(() => {
    categoryPngRef.current = null;
    vendeurPngRef.current = null;
    if (rowsEmpty) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const catEl = categoryCaptureRef.current;
      if (catEl) {
        const cat = await captureElementToPngFile(catEl, categoryFilename);
        if (!cancelled && cat.ok) {
          categoryPngRef.current = cat.file;
        }
      }
      const vendEl = vendeurCaptureRef.current;
      if (vendEl) {
        const vend = await captureElementToPngFile(vendEl, vendeurFilename);
        if (!cancelled && vend.ok) {
          vendeurPngRef.current = vend.file;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryFilename, vendeurFilename, categorySections, vendeurSections, footer, productCount, rowsEmpty]);

  const ensureCategoryPng = useCallback(async (): Promise<File | null> => {
    if (categoryPngRef.current) {
      return categoryPngRef.current;
    }
    const el = categoryCaptureRef.current;
    if (!el) {
      return null;
    }
    const captured = await captureElementToPngFile(el, categoryFilename);
    if (!captured.ok) {
      setExportErr(captured.error);
      return null;
    }
    categoryPngRef.current = captured.file;
    return captured.file;
  }, [categoryFilename]);

  const ensureVendeurPng = useCallback(async (): Promise<File | null> => {
    if (vendeurPngRef.current) {
      return vendeurPngRef.current;
    }
    const el = vendeurCaptureRef.current;
    if (!el) {
      return null;
    }
    const captured = await captureElementToPngFile(el, vendeurFilename);
    if (!captured.ok) {
      setExportErr(captured.error);
      return null;
    }
    vendeurPngRef.current = captured.file;
    return captured.file;
  }, [vendeurFilename]);

  const onExportCategory = useCallback(async () => {
    const el = categoryCaptureRef.current;
    if (!el) {
      return;
    }
    setExportingCategory(true);
    setExportErr(null);
    const result = await exportElementAsPng(el, categoryFilename);
    if (!result.ok) {
      setExportErr(result.error);
    }
    setExportingCategory(false);
  }, [categoryFilename]);

  const onExportVendeur = useCallback(async () => {
    const el = vendeurCaptureRef.current;
    if (!el) {
      return;
    }
    setExportingVendeur(true);
    setExportErr(null);
    const result = await exportElementAsPng(el, vendeurFilename);
    if (!result.ok) {
      setExportErr(result.error);
    }
    setExportingVendeur(false);
  }, [vendeurFilename]);

  const onWhatsAppChauffeur = useCallback(
    async (e: MouseEvent<HTMLAnchorElement>) => {
      const href = whatsAppHref;
      if (!href) {
        return;
      }

      const downloadBoth = async () => {
        const [catFile, vendFile] = await Promise.all([ensureCategoryPng(), ensureVendeurPng()]);
        if (catFile) {
          downloadPngFileUnique(catFile, categoryFilename);
        }
        if (vendFile) {
          downloadPngFileUnique(vendFile, vendeurFilename);
        }
        if (!catFile && !vendFile) {
          setExportErr(tc("error"));
        }
      };

      if (categoryPngRef.current && vendeurPngRef.current) {
        downloadPngFileUnique(categoryPngRef.current, categoryFilename);
        downloadPngFileUnique(vendeurPngRef.current, vendeurFilename);
        return;
      }

      e.preventDefault();
      setWhatsAppBusy(true);
      setExportErr(null);
      try {
        await downloadBoth();
        window.open(href, "_blank", "noopener,noreferrer");
      } finally {
        setWhatsAppBusy(false);
      }
    },
    [categoryFilename, ensureCategoryPng, ensureVendeurPng, tc, vendeurFilename, whatsAppHref],
  );

  if (rowsEmpty) {
    return null;
  }

  const capturePaneProps = {
    captureLabels,
    productCount,
    magasinColumns,
    tableLabels,
    footer,
    lotCommentExportLabel,
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outlined"
          size="small"
          startIcon={<ImageOutlinedIcon />}
          disabled={exportingCategory || exportingVendeur || whatsAppBusy}
          onClick={() => void onExportCategory()}
          sx={{ textTransform: "none" }}
        >
          {exportingCategory ? tc("loadingEllipsis") : t("exportByCategory")}
        </Button>
        <Button
          type="button"
          variant="outlined"
          size="small"
          startIcon={<ImageOutlinedIcon />}
          disabled={exportingCategory || exportingVendeur || whatsAppBusy}
          onClick={() => void onExportVendeur()}
          sx={{ textTransform: "none" }}
        >
          {exportingVendeur ? tc("loadingEllipsis") : t("exportByVendor")}
        </Button>
        {whatsAppHref ? (
          <Button
            variant="contained"
            size="small"
            color="success"
            component="a"
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<WhatsAppIcon />}
            disabled={exportingCategory || exportingVendeur || whatsAppBusy}
            onClick={(ev) => void onWhatsAppChauffeur(ev)}
            sx={{ textTransform: "none" }}
          >
            {whatsAppBusy ? tc("loadingEllipsis") : t("sendWhatsAppDriver")}
          </Button>
        ) : (
          <Button
            variant="outlined"
            size="small"
            color="success"
            startIcon={<WhatsAppIcon />}
            disabled
            sx={{ textTransform: "none" }}
          >
            {t("sendWhatsAppDriver")}
          </Button>
        )}
      </div>
      {chauffeur && chauffeurPhone ? (
        <Typography variant="caption" color="text.secondary" className="!mt-1 block">
          {t("driverConfigured", { name: chauffeur.displayName, phone: chauffeurPhone })}
        </Typography>
      ) : null}
      {exportErr ? (
        <Typography color="error" variant="body2" className="!mt-2">
          {exportErr}
        </Typography>
      ) : null}
      {!phoneOk && chauffeurPhone.length > 0 ? (
        <Typography variant="caption" color="warning.main" className="!mt-1 block">
          {t("driverPhoneInvalid")}
        </Typography>
      ) : null}
      {!chauffeurLoading && !chauffeurPhone ? (
        <Typography variant="caption" color="text.secondary" className="!mt-1 block">
          {t("driverNotConfigured")}{" "}
          <AppLink href="/parametres" className="text-emerald-700 underline">
            {t("driverSettingsLink")}
          </AppLink>
          .
        </Typography>
      ) : null}

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
        <CapturePane captureRef={categoryCaptureRef} sections={categorySections} {...capturePaneProps} />
        <CapturePane captureRef={vendeurCaptureRef} sections={vendeurSections} {...capturePaneProps} />
      </Box>
    </>
  );
}
