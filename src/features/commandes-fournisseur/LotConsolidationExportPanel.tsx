"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
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
import {
  stationExportLocale,
  vendorRecapCaptureLabels,
} from "@/lib/commandes-fournisseur/vendor-recap-capture-i18n";
import {
  buildCategoryExportSections,
  buildVendeurExportSections,
  localizeLotExportSections,
  type LotExportSection,
  type MagasinMxColumn,
  type RecapLigneInput,
  type VendeurRef,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";
import {
  a4LandscapeCaptureRootSx,
  arabicTextClassName,
  arabicTextSx,
  consolidationA4ColumnCount,
  LotGroupedRecapTable,
  VendeurRecapCaptureHeader,
} from "@/features/commandes-fournisseur/vendeur-recap-export-parts";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/url";
import arMessages from "@/messages/ar-MA.json";
import type { AppLocale } from "@/i18n/config";

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
  layout = "sections",
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
  layout?: "sections" | "category-flow";
}) {
  const bodyOuterRef = useRef<HTMLDivElement>(null);
  const bodyInnerRef = useRef<HTMLDivElement>(null);

  const totalRows = useMemo(
    () => sections.reduce((n, s) => n + s.rows.length + 1, 0),
    [sections],
  );
  /** Plus de colonnes si beaucoup de lignes, pour éviter un scale trop fort. */
  const columnCount = useMemo(() => {
    const base = consolidationA4ColumnCount(totalRows);
    if (totalRows > 22) {
      return Math.max(base, 3);
    }
    if (totalRows > 12) {
      return Math.max(base, 2);
    }
    return base;
  }, [totalRows]);
  const isRtl = captureLabels.dir === "rtl";

  useLayoutEffect(() => {
    const root = captureRef.current;
    const outer = bodyOuterRef.current;
    const inner = bodyInnerRef.current;
    if (!root || !outer || !inner) {
      return;
    }

    // Reset avant mesure. `zoom` réduit le layout (capturé correctement en PNG), pas `transform`.
    inner.style.zoom = "1";
    inner.style.transform = "";
    outer.style.height = "auto";
    outer.style.overflow = "visible";

    const headerEl = root.querySelector<HTMLElement>("[data-a4-header]");
    const footerEl = root.querySelector<HTMLElement>("[data-a4-footer]");
    const chrome = (headerEl?.offsetHeight ?? 0) + (footerEl?.offsetHeight ?? 0) + 8;
    const availableH = Math.max(48, root.clientHeight - chrome);
    const availableW = Math.max(48, root.clientWidth);
    const neededH = Math.max(1, inner.scrollHeight);
    const neededW = Math.max(1, inner.scrollWidth);
    let zoom = Math.min(1, availableH / neededH, availableW / neededW);
    zoom = Math.max(0.28, zoom);
    inner.style.zoom = String(zoom);

    // 2ᵉ passe : si ça dépasse encore (arrondis / polices), resserrer.
    const rect = inner.getBoundingClientRect();
    if (rect.height > availableH + 1 || rect.width > availableW + 1) {
      const z2 = Math.min(availableH / Math.max(1, rect.height), availableW / Math.max(1, rect.width));
      zoom = Math.max(0.28, zoom * z2);
      inner.style.zoom = String(zoom);
    }

    outer.style.height = `${availableH}px`;
    outer.style.overflow = "hidden";
  }, [captureRef, sections, magasinColumns, productCount, footer, columnCount, tableLabels, isRtl, layout]);

  return (
    <Box
      ref={captureRef}
      dir={captureLabels.dir}
      lang={isRtl ? "ar" : undefined}
      style={{ direction: captureLabels.dir }}
      sx={a4LandscapeCaptureRootSx}
    >
      <Box data-a4-header sx={{ flexShrink: 0, mb: "2mm" }}>
        <VendeurRecapCaptureHeader
          magasinHeader=""
          vendeurLabel=""
          showVendeurHeader={false}
          orderOnLine={captureLabels.orderOnLine}
          orderByLine={captureLabels.orderByLine}
          productCount={productCount}
          dir={captureLabels.dir}
        />
      </Box>
      <Box
        ref={bodyOuterRef}
        sx={{
          flex: "1 1 auto",
          minHeight: 0,
          width: "100%",
          position: "relative",
        }}
      >
        <Box
          ref={bodyInnerRef}
          sx={{
            width: "max-content",
            mx: "auto",
          }}
        >
          <LotGroupedRecapTable
            sections={sections}
            magasinColumns={magasinColumns}
            labels={tableLabels}
            captureDir={captureLabels.dir}
            compact
            columnCount={columnCount}
            layout={layout}
          />
        </Box>
      </Box>
      {footer ? (
        <Typography
          data-a4-footer
          variant="caption"
          component="p"
          className={isRtl ? arabicTextClassName : undefined}
          dir={isRtl ? "rtl" : undefined}
          lang={isRtl ? "ar" : undefined}
          sx={{
            flexShrink: 0,
            mt: "2mm",
            mb: 0,
            lineHeight: 1.3,
            fontSize: "0.65rem",
            whiteSpace: "nowrap",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...(isRtl ? arabicTextSx : {}),
          }}
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

  /** Station (sans marchands) : pas d’export « par vendeur ». Images consolidation : toujours arabe (marché + Station). */
  const showVendeurExport = vendeurs.length > 0;
  const exportLocale: AppLocale = stationExportLocale();

  const captureLabels = useMemo(
    () => vendorRecapCaptureLabels(exportLocale, supplierLabel, commandeDateLabel, null),
    [exportLocale, supplierLabel, commandeDateLabel],
  );

  const noCategoryForExport = arMessages.backoffice.commandes.common.noCategory;

  const categorySections = useMemo(() => {
    const raw = buildCategoryExportSections(
      lignes,
      magasinColumns,
      noCategoryForExport,
      exportLocale,
    );
    return localizeLotExportSections(raw, lignes, exportLocale, captureLabels.formatSoitLine);
  }, [lignes, magasinColumns, noCategoryForExport, exportLocale, captureLabels.formatSoitLine]);

  const vendeurSections = useMemo(() => {
    if (!showVendeurExport) {
      return [] as LotExportSection[];
    }
    const raw = buildVendeurExportSections(lignes, vendeurs, magasinColumns, supplierLabel);
    return localizeLotExportSections(raw, lignes, exportLocale, captureLabels.formatSoitLine);
  }, [
    lignes,
    vendeurs,
    magasinColumns,
    supplierLabel,
    showVendeurExport,
    exportLocale,
    captureLabels.formatSoitLine,
  ]);

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
      quantity: arMessages.backoffice.commandes.common.quantity,
      total: captureLabels.total,
      udvCond: captureLabels.udvCond,
      noLines: captureLabels.noLines,
    }),
    [captureLabels],
  );

  const footer = lotComment?.trim() ?? "";
  const productCount = useMemo(() => {
    const n = lignes.length;
    return n === 1 ? "1 منتج" : `${n} منتجات`;
  }, [lignes.length]);
  const rowsEmpty = lignes.length === 0;
  const lotCommentExportLabel =
    arMessages.backoffice.commandes.validation.lotDetail.consolidationExport.lotCommentExportLabel;

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
      // Laisser le zoom A4 s’appliquer (useLayoutEffect) avant capture PNG.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled) {
        return;
      }
      const catEl = categoryCaptureRef.current;
      if (catEl) {
        const cat = await captureElementToPngFile(catEl, categoryFilename);
        if (!cancelled && cat.ok) {
          categoryPngRef.current = cat.file;
        }
      }
      if (!showVendeurExport) {
        return;
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
  }, [
    categoryFilename,
    vendeurFilename,
    categorySections,
    vendeurSections,
    footer,
    productCount,
    rowsEmpty,
    showVendeurExport,
  ]);

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

      const downloadImages = async () => {
        const catFile = await ensureCategoryPng();
        if (catFile) {
          downloadPngFileUnique(catFile, categoryFilename);
        }
        let vendFile: File | null = null;
        if (showVendeurExport) {
          vendFile = await ensureVendeurPng();
          if (vendFile) {
            downloadPngFileUnique(vendFile, vendeurFilename);
          }
        }
        if (!catFile && !vendFile) {
          setExportErr(tc("error"));
        }
      };

      const ready =
        categoryPngRef.current && (!showVendeurExport || vendeurPngRef.current);
      if (ready) {
        downloadPngFileUnique(categoryPngRef.current!, categoryFilename);
        if (showVendeurExport && vendeurPngRef.current) {
          downloadPngFileUnique(vendeurPngRef.current, vendeurFilename);
        }
        return;
      }

      e.preventDefault();
      setWhatsAppBusy(true);
      setExportErr(null);
      try {
        await downloadImages();
        window.open(href, "_blank", "noopener,noreferrer");
      } finally {
        setWhatsAppBusy(false);
      }
    },
    [
      categoryFilename,
      ensureCategoryPng,
      ensureVendeurPng,
      showVendeurExport,
      tc,
      vendeurFilename,
      whatsAppHref,
    ],
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
          {exportingCategory
            ? tc("loadingEllipsis")
            : showVendeurExport
              ? t("exportByCategory")
              : tc("exportImage")}
        </Button>
        {showVendeurExport ? (
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
        ) : null}
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
        <CapturePane
          captureRef={categoryCaptureRef}
          sections={categorySections}
          layout="category-flow"
          {...capturePaneProps}
        />
        {showVendeurExport ? (
          <CapturePane
            captureRef={vendeurCaptureRef}
            sections={vendeurSections}
            layout="sections"
            {...capturePaneProps}
          />
        ) : null}
      </Box>
    </>
  );
}
