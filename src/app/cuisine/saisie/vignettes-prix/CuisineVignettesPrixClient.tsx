"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import BackNavButton from "@/components/BackNavButton";
import { exportElementAsPng } from "@/lib/commandes-fournisseur/export-element-png";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadFrigoProducts } from "@/lib/cuisine/load-frigo-products";
import {
  CUISINE_PICKER_COLUMN_OPTIONS,
  CUISINE_PICKER_COLUMNS_DEFAULT,
  clampPickerColumns,
  readPickerColumnsFromStorage,
  writePickerColumnsToStorage,
  type CuisinePickerColumnCount,
} from "@/lib/cuisine/picker-columns-preference";
import { compareProductDisplayNames } from "@/lib/products/product-display-name";
import { productPhotoPublicUrl } from "@/lib/products/storage";
import { useAppFormat, useAppLocale } from "@/lib/i18n/useAppFormat";
import type { CuisineFrigoProduct, CuisineSubcategoryGroup } from "@/lib/cuisine/types";
import CuisineProductGridCard from "../ajouter/CuisineProductGridCard";
import "./vignettes-prix-print.css";

function printColumnsForProductCount(count: number): number {
  if (count <= 12) return 4;
  if (count <= 24) return 6;
  if (count <= 40) return 7;
  return 8;
}

function formatProductPrice(
  product: CuisineFrigoProduct,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  const price = product.price;
  if (price == null || !Number.isFinite(price) || price <= 0) return "—";
  return formatNumber(price, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

type ProductGridProps = {
  products: CuisineFrigoProduct[];
  columnsPerRow: number;
  compact?: boolean;
  supabase: ReturnType<typeof createSupabaseBrowserClient>;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

function ProductGrid({ products, columnsPerRow, compact = false, supabase, formatNumber }: ProductGridProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
        gap: compact ? { xs: 0.5, sm: 0.625 } : { xs: 1.25, sm: 1.5 },
        alignItems: "stretch",
      }}
    >
      {products.map((product) => (
        <CuisineProductGridCard
          key={product.id}
          product={product}
          photoUrl={productPhotoPublicUrl(supabase, product.image_path)}
          columnsPerRow={columnsPerRow}
          formattedPrice={formatProductPrice(product, formatNumber)}
          compact={compact}
        />
      ))}
    </Box>
  );
}

function chunkProducts<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [];
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

type PrintCategoryTableProps = {
  group: CuisineSubcategoryGroup;
  columnsPerRow: number;
  supabase: ReturnType<typeof createSupabaseBrowserClient>;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

function PrintCategoryTable({ group, columnsPerRow, supabase, formatNumber }: PrintCategoryTableProps) {
  const rows = chunkProducts(group.products, columnsPerRow);

  return (
    <table
      className="print-category-table"
      style={{ ["--print-cols" as string]: String(columnsPerRow) }}
    >
      <thead>
        <tr>
          <th colSpan={columnsPerRow}>{group.subcategoryLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((product) => (
              <td key={product.id} className="print-category-cell">
                <CuisineProductGridCard
                  product={product}
                  photoUrl={productPhotoPublicUrl(supabase, product.image_path)}
                  columnsPerRow={columnsPerRow}
                  formattedPrice={formatProductPrice(product, formatNumber)}
                  compact
                />
              </td>
            ))}
            {row.length < columnsPerRow
              ? Array.from({ length: columnsPerRow - row.length }, (_, cellIndex) => (
                  <td
                    key={`empty-${rowIndex}-${cellIndex}`}
                    className="print-category-cell print-category-cell--empty"
                    aria-hidden
                  />
                ))
              : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function preloadImageUrls(urls: readonly string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}

export default function CuisineVignettesPrixClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.cuisine.vignettesPrix");
  const tCommon = useTranslations("common");
  const locale = useAppLocale();
  const { formatNumber } = useAppFormat();
  const { loading: permLoading, canCuisineSaisie } = useSessionPermissions();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [groups, setGroups] = useState<CuisineSubcategoryGroup[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const [columnsPerRow, setColumnsPerRow] = useState<CuisinePickerColumnCount>(CUISINE_PICKER_COLUMNS_DEFAULT);
  const [downloading, setDownloading] = useState(false);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const productImageUrls = useMemo(
    () =>
      groups
        .flatMap((group) =>
          group.products.map((product) => productPhotoPublicUrl(supabase, product.image_path)),
        )
        .filter((url): url is string => typeof url === "string" && url.length > 0),
    [groups, supabase],
  );

  const preparePrintAssets = useCallback(async () => {
    await preloadImageUrls(productImageUrls);
  }, [productImageUrls]);

  useEffect(() => {
    setColumnsPerRow(readPickerColumnsFromStorage());
  }, []);

  const handleColumnsPerRowChange = (event: SelectChangeEvent<number>) => {
    const next = clampPickerColumns(Number(event.target.value));
    setColumnsPerRow(next);
    writePickerColumnsToStorage(next);
  };

  const handlePrint = useCallback(async () => {
    await preparePrintAssets();
    window.print();
  }, [preparePrintAssets]);

  const handleDownload = useCallback(async () => {
    const el = printRef.current;
    if (!el) return;
    setDownloading(true);
    setDownloadErr(null);
    document.body.classList.add("vignettes-exporting");
    try {
      await preparePrintAssets();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      const dateLabel = new Date().toISOString().slice(0, 10);
      const result = await exportElementAsPng(el, `vignettes-prix-frigo-${dateLabel}.png`);
      if (!result.ok) {
        setDownloadErr(result.error);
      }
    } catch (e) {
      setDownloadErr(e instanceof Error ? e.message : String(e));
    } finally {
      document.body.classList.remove("vignettes-exporting");
      setDownloading(false);
    }
  }, [preparePrintAssets]);

  const filteredGroups = useMemo(() => {
    if (!subcategoryFilter) return [];
    return groups
      .filter((g) => (g.subcategoryId ?? "__none__") === subcategoryFilter)
      .map((group) => ({
        ...group,
        products: [...group.products].sort((a, b) => compareProductDisplayNames(locale, a, b)),
      }));
  }, [groups, subcategoryFilter, locale]);

  const totalProductCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.products.length, 0),
    [groups],
  );

  const printColumns = useMemo(
    () => printColumnsForProductCount(totalProductCount),
    [totalProductCount],
  );

  useEffect(() => {
    if (!permLoading && !canCuisineSaisie) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, canCuisineSaisie, router]);

  useEffect(() => {
    if (!canCuisineSaisie) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      const { groups: g, error } = await loadFrigoProducts(supabase, locale, t("uncategorized"));
      if (cancelled) return;
      if (error) {
        setErr(error);
        setGroups([]);
      } else {
        setGroups(g);
        const firstKey = g[0] ? (g[0].subcategoryId ?? "__none__") : null;
        setSubcategoryFilter(firstKey);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canCuisineSaisie, supabase, locale, t]);

  if (permLoading) {
    return <p className="px-4 py-6 text-slate-600">{tCommon("loading")}</p>;
  }

  if (!canCuisineSaisie) return null;

  const printDir = locale === "ar-MA" ? "rtl" : "ltr";
  const printLang = locale === "ar-MA" ? "ar" : "fr";

  return (
    <>
      <main className="vignettes-screen mx-auto w-full px-4 py-4 sm:px-6 md:px-8">
        <BackNavButton href="/cuisine/saisie">{t("backToSaisie")}</BackNavButton>

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mt: 1, mb: 2 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600, flex: "1 1 auto", minWidth: 0 }}>
            {t("title")}
          </Typography>
          <Button
            type="button"
            variant="outlined"
            color="success"
            startIcon={<DownloadOutlinedIcon />}
            onClick={() => void handleDownload()}
            disabled={loading || downloading || groups.length === 0}
            sx={{ textTransform: "none", flexShrink: 0 }}
          >
            {t("download")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            startIcon={<PrintOutlinedIcon />}
            onClick={() => void handlePrint()}
            disabled={loading || downloading || groups.length === 0}
            sx={{ textTransform: "none", flexShrink: 0 }}
          >
            {t("print")}
          </Button>
        </Box>

        {downloadErr ? (
          <Typography color="error" className="!mb-2">
            {downloadErr}
          </Typography>
        ) : null}

        {err ? (
          <Typography color="error" className="!mb-2">
            {err}
          </Typography>
        ) : null}

        {loading ? (
          <Typography color="text.secondary">{tCommon("loading")}</Typography>
        ) : groups.length === 0 ? (
          <Typography color="text.secondary">{t("emptyProducts")}</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {groups.map((group) => {
                const key = group.subcategoryId ?? "__none__";
                const selected = subcategoryFilter === key;
                return (
                  <Button
                    key={key}
                    type="button"
                    variant={selected ? "contained" : "outlined"}
                    color="success"
                    size="medium"
                    onClick={() => setSubcategoryFilter(key)}
                    sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, minHeight: 44 }}
                  >
                    {group.subcategoryLabel}
                  </Button>
                );
              })}
            </Box>

            {filteredGroups.length === 0 ? (
              <Typography color="text.secondary">{t("emptyProducts")}</Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {filteredGroups.map((group) => (
                  <section key={group.subcategoryId ?? "__none__"}>
                    <ProductGrid
                      products={group.products}
                      columnsPerRow={columnsPerRow}
                      supabase={supabase}
                      formatNumber={formatNumber}
                    />
                  </section>
                ))}
              </Box>
            )}

            <FormControl size="small" sx={{ alignSelf: "flex-start", minWidth: 160, mt: 1 }}>
              <InputLabel id="vignettes-columns-label">{t("columnsPerRowLabel")}</InputLabel>
              <Select
                labelId="vignettes-columns-label"
                label={t("columnsPerRowLabel")}
                value={columnsPerRow}
                onChange={handleColumnsPerRowChange}
              >
                {CUISINE_PICKER_COLUMN_OPTIONS.map((count) => (
                  <MenuItem key={count} value={count}>
                    {t("columnsPerRowOption", { count })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
      </main>

      <div ref={printRef} className="vignettes-print" dir={printDir} lang={printLang}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 1.5, textAlign: "center" }}>
          {t("printTitle")}
        </Typography>
        {groups.map((group) => (
          <PrintCategoryTable
            key={group.subcategoryId ?? "__none__"}
            group={group}
            columnsPerRow={printColumns}
            supabase={supabase}
            formatNumber={formatNumber}
          />
        ))}
      </div>
    </>
  );
}
