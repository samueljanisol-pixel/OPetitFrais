"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import type { CaisseClotureStatus, ClotureListItem } from "@/lib/clotures/types";
import { formatClotureWhen, formatDh } from "./format";
import { normalizePosCode } from "@/lib/clotures/normalize-codes";
import type { SessionMagasin } from "@/lib/auth/session-types";

const TEST_MAGASIN: SessionMagasin = { id: "test-00", code: "00", nom: "Magasin test" };

const FILTERS: Array<{ key: string; status: CaisseClotureStatus | "" }> = [
  { key: "all", status: "" },
  { key: "a_verifier", status: "a_verifier" },
  { key: "verifiee", status: "verifiee" },
];

export default function CloturesListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can, linkedMagasins } = useSessionPermissions();
  const { labelFor } = useStatusLabels();

  const filterKey = searchParams.get("filter") ?? "all";
  const tabIndex = Math.max(0, FILTERS.findIndex((f) => f.key === filterKey));
  const magasinFilter = normalizePosCode(searchParams.get("magasin") ?? "");

  const magasinOptions = (() => {
    const seen = new Set<string>();
    const options: SessionMagasin[] = [];
    for (const magasin of [TEST_MAGASIN, ...linkedMagasins]) {
      const code = normalizePosCode(magasin.code);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      options.push({ ...magasin, code });
    }
    return options;
  })();

  const [clotures, setClotures] = useState<ClotureListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !can("ventes.read") && !can("ventes.write")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const filter = FILTERS.find((f) => f.key === filterKey);
      if (filter?.status) params.set("status", filter.status);
      if (magasinFilter) params.set("magasin", magasinFilter);
      const res = await fetch(`/api/clotures?${params.toString()}`, { credentials: "include" });
      const json = (await res.json()) as { clotures?: ClotureListItem[]; error?: string };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        setClotures([]);
        return;
      }
      setClotures(json.clotures ?? []);
    } catch {
      setErr(tCommon("error"));
      setClotures([]);
    } finally {
      setLoading(false);
    }
  }, [filterKey, magasinFilter, tCommon]);

  useEffect(() => {
    if (permLoading) return;
    void load();
  }, [permLoading, load]);

  const setFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "all") params.delete("filter");
    else params.set("filter", key);
    const qs = params.toString();
    router.replace(qs ? `/clotures?${qs}` : "/clotures");
  };

  return (
    <Box sx={{ maxWidth: 880, mx: "auto", px: 2, py: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <AppLink href="/" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <BackChevron fontSize="small" />
          {tCommon("home")}
        </AppLink>
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
        Clôtures
      </Typography>

      <FormControl size="small" sx={{ mb: 1.5, minWidth: 240 }}>
        <InputLabel id="cloture-magasin-label">Magasin</InputLabel>
        <Select
          labelId="cloture-magasin-label"
          label="Magasin"
          value={magasinFilter}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams.toString());
            const next = normalizePosCode(String(e.target.value));
            if (next) params.set("magasin", next);
            else params.delete("magasin");
            const qs = params.toString();
            router.replace(qs ? `/clotures?${qs}` : "/clotures");
          }}
        >
          <MenuItem value="">Tous</MenuItem>
          {magasinOptions.map((m) => (
            <MenuItem key={m.id} value={m.code}>
              {m.code === "00" ? "Magasin test" : `${m.nom} (${m.code})`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Tabs value={tabIndex} onChange={(_, i) => setFilter(FILTERS[i]?.key ?? "all")} sx={{ mb: 1 }}>
        <Tab label="Toutes" />
        <Tab label={labelFor("caisse_cloture", "a_verifier")} />
        <Tab label={labelFor("caisse_cloture", "verifiee")} />
      </Tabs>

      {err ? <Alert severity="error">{err}</Alert> : null}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : clotures.length === 0 ? (
        <Typography color="text.secondary">Aucune clôture.</Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {clotures.map((row) => (
              <ListItem key={row.clotureRef} disablePadding divider>
                <ListItemButton onClick={() => router.push(`/clotures/${encodeURIComponent(row.clotureRef)}`)}>
                  <Box sx={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 800 }}>{row.clotureRef}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        M{row.magasinCode} C{row.caisseCode} · {row.caissierName} · {formatClotureWhen(row.closedAt)}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 700 }}>{formatDh(row.saleTotal)} DH</Typography>
                      <Chip
                        size="small"
                        color={row.status === "a_verifier" ? "warning" : "success"}
                        label={labelFor("caisse_cloture", row.status)}
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                  </Box>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
