"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { RefStatusLabelRow } from "@/lib/statusLabels/types";
import { FALLBACK_STATUS_LABELS, fallbackStatusLabel } from "@/lib/statusLabels/defaults";

export function useStatusLabels() {
  const [rows, setRows] = useState<RefStatusLabelRow[] | null>(null);
  const tStatus = useTranslations("backoffice.status");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ref/status-labels", { credentials: "include" });
        const j = (await res.json()) as { labels?: RefStatusLabelRow[]; error?: string };
        if (cancelled) return;
        if (res.ok && j.labels) {
          setRows(j.labels);
        } else {
          setRows([]);
        }
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const labelFor = useCallback(
    (domain: string, code: string) => {
      const i18nDomain = FALLBACK_STATUS_LABELS[domain];
      if (i18nDomain && code in i18nDomain) {
        return tStatus(`${domain}.${code}` as "commande_fournisseur.en_saisie");
      }

      const r = rows?.find((x) => x.domain === domain && x.status_code === code);
      const dbLabel = r?.label?.trim();
      if (dbLabel) return dbLabel;
      return fallbackStatusLabel(domain, code);
    },
    [rows, tStatus],
  );

  return { labelFor, loaded: rows !== null };
}
