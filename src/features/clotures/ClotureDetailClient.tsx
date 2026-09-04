"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import FormDialog from "@/lib/mui/FormDialog";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import type { ClotureDetail } from "@/lib/clotures/types";
import {
  ecartColor,
  formatClotureWhen,
  formatDh,
  formatDrawerDetail,
  formatEcartDh,
  verifyTotals,
} from "./format";

const BILL_IMAGES: Array<{ key: "bills200" | "bills100" | "bills50" | "bills20"; label: string; src: string }> = [
  { key: "bills200", label: "Billets de 200", src: "/monnaie/billet-200.jpg" },
  { key: "bills100", label: "Billets de 100", src: "/monnaie/billet-100.jpg" },
  { key: "bills50", label: "Billets de 50", src: "/monnaie/billet-50.jpg" },
  { key: "bills20", label: "Billets de 20", src: "/monnaie/billet-20.jpg" },
];

const MINUS_STEPS = [-10, -1] as const;
const PLUS_STEPS = [1, 10] as const;
const COUNT_MAX = 9999;

function parseCount(raw: string): number {
  if (!raw.trim()) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function bumpCount(raw: string, delta: number): string {
  const next = Math.max(0, Math.min(COUNT_MAX, parseCount(raw) + delta));
  return String(next);
}

function Line({
  label,
  value,
  extra,
  color,
}: {
  label: string;
  value: string;
  extra?: string | null;
  color?: "success.main" | "error.main" | "text.primary";
}) {
  return (
    <Typography sx={{ py: 0.35, color: color ?? "text.primary", fontWeight: color ? 700 : 400 }}>
      {label} : <strong>{value}</strong>
      {extra ? ` ${extra}` : ""}
    </Typography>
  );
}

type Props = { clotureRef: string };

export default function ClotureDetailClient({ clotureRef }: Props) {
  const router = useRouter();
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();
  const { labelFor } = useStatusLabels();
  const canVerify = can("ventes.write");

  const [cloture, setCloture] = useState<ClotureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({ bills200: "", bills100: "", bills50: "", bills20: "" });

  useEffect(() => {
    if (!permLoading && !can("ventes.read") && !can("ventes.write")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setErr(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/clotures/${encodeURIComponent(clotureRef)}`, { credentials: "include" });
        const json = (await res.json()) as { cloture?: ClotureDetail; error?: string };
        if (!res.ok) {
          if (!cancelled) {
            setErr(json.error ?? tCommon("error"));
            setCloture(null);
          }
          return;
        }
        if (!cancelled) setCloture(json.cloture ?? null);
      } catch {
        if (!cancelled) setErr(tCommon("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clotureRef, tCommon]);

  const counts = {
    bills200: parseCount(values.bills200),
    bills100: parseCount(values.bills100),
    bills50: parseCount(values.bills50),
    bills20: parseCount(values.bills20),
  };
  const cashSales = cloture?.payments.find((p) => p.mode === "cash")?.amount ?? 0;
  const preview = cloture
    ? verifyTotals({ ...counts, drawerTotal: cloture.drawerTotal, cashSales })
    : null;

  const submitVerify = async () => {
    if (!cloture || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/clotures/${encodeURIComponent(cloture.clotureRef)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(counts),
      });
      const json = (await res.json()) as { cloture?: ClotureDetail; error?: string };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        return;
      }
      if (json.cloture) setCloture(json.cloture);
      setVerifyOpen(false);
    } catch {
      setErr(tCommon("error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading || permLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!cloture) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 2 }}>
        <AppLink href="/clotures" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <BackChevron fontSize="small" />
          Clôtures
        </AppLink>
        <Alert severity="error" sx={{ mt: 2 }}>
          {err ?? "Clôture introuvable"}
        </Alert>
      </Box>
    );
  }

  const storedVerify =
    cloture.verifyBills200 != null
      ? verifyTotals({
          bills200: cloture.verifyBills200,
          bills100: cloture.verifyBills100 ?? 0,
          bills50: cloture.verifyBills50 ?? 0,
          bills20: cloture.verifyBills20 ?? 0,
          drawerTotal: cloture.drawerTotal,
          cashSales,
        })
      : null;

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 2 }}>
      <AppLink href="/clotures" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <BackChevron fontSize="small" />
        Clôtures
      </AppLink>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5, mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {cloture.clotureRef}
        </Typography>
        <Chip
          size="small"
          color={cloture.status === "a_verifier" ? "warning" : "success"}
          label={labelFor("caisse_cloture", cloture.status)}
        />
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Magasin {cloture.magasinCode} · Caisse {cloture.caisseCode} · {cloture.caissierName}
        <br />
        Ouverture {formatClotureWhen(cloture.openedAt)} · Fermeture {formatClotureWhen(cloture.closedAt)}
      </Typography>
      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      <Line
        label="Total vente"
        value={`${formatDh(cloture.saleTotal)} DH`}
        extra={cloture.creditSaleTotal > 0 ? `dont Crédit : ${formatDh(cloture.creditSaleTotal)} DH` : null}
      />
      <Line label="Nombre de ventes" value={String(cloture.saleCount)} />
      <Line label="Panier moyen" value={`${formatDh(cloture.averageBasket)} DH`} />
      <Line label="Livraison" value={`${formatDh(cloture.deliveryTotal)} DH`} />
      <Line
        label="Total règlement"
        value={`${formatDh(cloture.settlementTotal)} DH`}
        extra={
          cloture.creditSettlementTotal > 0
            ? `dont Paiement Crédit : ${formatDh(cloture.creditSettlementTotal)} DH`
            : null
        }
      />

      <Typography sx={{ fontWeight: 800, mt: 2, mb: 0.5 }}>Paiements</Typography>
      {cloture.payments.map((p) => {
        const cardCount = p.mode === "card" ? ` (${p.ticketCount})` : "";
        const creditExtra =
          p.creditSettlement > 0 ? ` dont Paiement Crédit : ${formatDh(p.creditSettlement)} DH` : "";
        return (
          <Line
            key={p.mode}
            label={`${p.label}${cardCount}`}
            value={`${formatDh(p.amount)} DH`}
            extra={creditExtra || null}
          />
        );
      })}

      <Typography sx={{ fontWeight: 800, mt: 2, mb: 0.5 }}>Fond de caisse (caissier)</Typography>
      <Line
        label="Total fond"
        value={`${formatDh(cloture.drawerTotal)} DH`}
        extra={formatDrawerDetail(cloture.bills50, cloture.bills20, cloture.coins10)}
      />

      {storedVerify ? (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Vérification</Typography>
          <Line label="Total compté" value={`${formatDh(storedVerify.counted)} DH`} />
          <Line label="Total + fond de caisse" value={`${formatDh(storedVerify.withFloat)} DH`} />
          <Line label="Total vente espèces" value={`${formatDh(storedVerify.cashSales)} DH`} />
          <Line
            label="Écart"
            value={`${formatEcartDh(storedVerify.difference)} DH`}
            color={ecartColor(storedVerify.difference)}
          />
        </Box>
      ) : null}

      {canVerify ? (
        <Button variant="contained" sx={{ mt: 2 }} onClick={() => setVerifyOpen(true)}>
          Vérifier
        </Button>
      ) : null}

      <FormDialog
        open={verifyOpen}
        onClose={() => {
          if (!saving) setVerifyOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Vérifier la clôture</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: "16px !important" }}>
          {BILL_IMAGES.map((bill) => (
            <Box key={bill.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                component="img"
                src={bill.src}
                alt={bill.label}
                sx={{ width: 88, height: 44, objectFit: "contain", bgcolor: "#fff", borderRadius: 0.5, flexShrink: 0 }}
              />
              <ButtonGroup variant="outlined" disabled={saving} sx={{ flexShrink: 0, height: 56 }}>
                {MINUS_STEPS.map((step) => (
                  <Button
                    key={step}
                    onClick={() =>
                      setValues((prev) => ({ ...prev, [bill.key]: bumpCount(prev[bill.key], step) }))
                    }
                    sx={{ minWidth: 48, height: 56, px: 1 }}
                  >
                    {String(step)}
                  </Button>
                ))}
              </ButtonGroup>
              <TextField
                value={values[bill.key]}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [bill.key]: e.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
                disabled={saving}
                slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": bill.label } }}
                sx={{
                  width: 72,
                  flex: "0 0 72px",
                  "& .MuiInputBase-input": { textAlign: "center" },
                }}
              />
              <ButtonGroup variant="outlined" disabled={saving} sx={{ flexShrink: 0, height: 56 }}>
                {PLUS_STEPS.map((step) => (
                  <Button
                    key={step}
                    onClick={() =>
                      setValues((prev) => ({ ...prev, [bill.key]: bumpCount(prev[bill.key], step) }))
                    }
                    sx={{ minWidth: 48, height: 56, px: 1 }}
                  >
                    {`+${step}`}
                  </Button>
                ))}
              </ButtonGroup>
            </Box>
          ))}
          {preview ? (
            <Box>
              <Line label="Total compté" value={`${formatDh(preview.counted)} DH`} />
              <Line label="Total + fond de caisse" value={`${formatDh(preview.withFloat)} DH`} />
              <Line label="Total vente espèces" value={`${formatDh(preview.cashSales)} DH`} />
              <Line
                label="Écart"
                value={`${formatEcartDh(preview.difference)} DH`}
                color={ecartColor(preview.difference)}
              />
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button disabled={saving} onClick={() => setVerifyOpen(false)}>
            Annuler
          </Button>
          <Button variant="contained" disabled={saving} onClick={() => void submitVerify()}>
            {saving ? "Enregistrement…" : "Valider"}
          </Button>
        </DialogActions>
      </FormDialog>
    </Box>
  );
}
