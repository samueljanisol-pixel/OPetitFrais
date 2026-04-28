"use client";

import { useCallback, useEffect, useState } from "react";
import type { RefStatusLabelRow } from "@/lib/statusLabels/types";
import { fallbackStatusLabel } from "@/lib/statusLabels/defaults";

export function useStatusLabels() {
  const [rows, setRows] = useState<RefStatusLabelRow[] | null>(null);

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

  const labelFor = useCallback((domain: string, code: string) => {
    const r = rows?.find((x) => x.domain === domain && x.status_code === code);
    const t = r?.label?.trim();
    if (t) return t;
    return fallbackStatusLabel(domain, code);
  }, [rows]);

  return { labelFor, loaded: rows !== null };
}
