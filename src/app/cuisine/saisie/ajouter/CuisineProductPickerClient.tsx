"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Box, Button, Typography } from "@mui/material";
import BackNavButton from "@/components/BackNavButton";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadFrigoProducts } from "@/lib/cuisine/load-frigo-products";
import { productPhotoPublicUrl } from "@/lib/products/storage";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { CuisineEntryType, CuisineSubcategoryGroup } from "@/lib/cuisine/types";
import CuisineProductGridCard from "./CuisineProductGridCard";

function parseEntryType(raw: string | null): CuisineEntryType | null {
  if (raw === "entree" || raw === "sortie") return raw;
  return null;
}

export default function CuisineProductPickerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryType = parseEntryType(searchParams.get("type"));
  const t = useTranslations("backoffice.cuisine.ajouter");
  const tCommon = useTranslations("common");
  const locale = useAppLocale();
  const { loading: permLoading, canCuisineSaisie } = useSessionPermissions();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [groups, setGroups] = useState<CuisineSubcategoryGroup[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** null = toutes les sous-catégories */
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);

  const filteredGroups = useMemo(() => {
    if (subcategoryFilter === null) return groups;
    return groups.filter((g) => (g.subcategoryId ?? "__none__") === subcategoryFilter);
  }, [groups, subcategoryFilter]);

  useEffect(() => {
    if (!permLoading && !canCuisineSaisie) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, canCuisineSaisie, router]);

  useEffect(() => {
    if (!entryType) {
      void router.replace("/cuisine/saisie");
    }
  }, [entryType, router]);

  useEffect(() => {
    if (!canCuisineSaisie || !entryType) return;
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
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canCuisineSaisie, entryType, supabase, locale, t]);

  if (permLoading || !entryType) {
    return <p className="px-4 py-6 text-slate-600">{tCommon("loading")}</p>;
  }

  if (!canCuisineSaisie) return null;

  const title = entryType === "entree" ? t("titleEntree") : t("titleSortie");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <BackNavButton href="/cuisine/saisie">{t("backToSaisie")}</BackNavButton>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mt: 1, mb: 2 }}>
        {title}
      </Typography>

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
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Button
              type="button"
              variant={subcategoryFilter === null ? "contained" : "outlined"}
              color="success"
              size="medium"
              onClick={() => setSubcategoryFilter(null)}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, minHeight: 44 }}
            >
              {t("filterAll")}
            </Button>
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
                  {subcategoryFilter === null ? (
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                      {group.subcategoryLabel}
                    </Typography>
                  ) : null}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 1.25,
                    }}
                  >
                    {group.products.map((product) => {
                      const href = `/cuisine/saisie/quantite?type=${entryType}&productId=${encodeURIComponent(product.id)}`;
                      const photoUrl = productPhotoPublicUrl(supabase, product.image_path);
                      return (
                        <CuisineProductGridCard
                          key={product.id}
                          product={product}
                          photoUrl={photoUrl}
                          href={href}
                        />
                      );
                    })}
                  </Box>
                </section>
              ))}
            </Box>
          )}
        </Box>
      )}
    </main>
  );
}
