"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import ClientFormDialog from "@/features/clients/ClientFormDialog";
import ClientPaiementFormDialog from "@/features/clients/ClientPaiementFormDialog";
import ClientPanierLinkDialog from "@/features/clients/ClientPanierLinkDialog";
import { formatMagasinLabel } from "@/lib/clients/pos-caisse-display";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type PanierRow = {
  id: string;
  cart_number: number;
  label: string;
  montant_total: number;
  submitted_at: string | null;
  paye: boolean;
  magasin_code: string | null;
  magasin_nom: string | null;
  caisse_code: string | null;
};

type PaiementRow = {
  id: string;
  payment_method_label: string;
  date_paiement: string;
  commentaire: string | null;
  montant: number;
  panier_ids: string[];
};

type ClientRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  is_system: boolean;
};

type Totals = { total: number; paye: number; reste: number };

type Props = {
  clientId: string;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPanierSecondary(
  p: PanierRow,
  formatDateTime: (iso: string) => string,
  formatDh: (n: number) => string,
  paidLabel: string,
  unpaidLabel: string,
  magasinLabel: string,
  caisseLabel: string,
): string {
  const parts: string[] = [];
  parts.push(p.submitted_at ? formatDateTime(p.submitted_at) : "—");

  const magasin = formatMagasinLabel(p);
  if (magasin) parts.push(`${magasinLabel} ${magasin}`);
  if (p.caisse_code) parts.push(`${caisseLabel} ${p.caisse_code}`);

  parts.push(`${formatDh(p.montant_total)} DH`);
  parts.push(p.paye ? paidLabel : unpaidLabel);
  return parts.join(" · ");
}

export default function ClientDetailClient({ clientId }: Props) {
  const router = useRouter();
  const t = useTranslations("backoffice.clients.detail");
  const tCommon = useTranslations("common");
  const { formatDateTime } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [paniers, setPaniers] = useState<PanierRow[]>([]);
  const [paiements, setPaiements] = useState<PaiementRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ total: 0, paye: 0, reste: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paiementOpen, setPaiementOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    if (!permLoading && !can("clients.read")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}`);
      const json = (await res.json()) as {
        client?: ClientRecord;
        paniers?: PanierRow[];
        paiements?: PaiementRow[];
        totals?: Totals;
        error?: string;
      };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setClient(json.client ?? null);
      setPaniers(json.paniers ?? []);
      setPaiements(json.paiements ?? []);
      setTotals(json.totals ?? { total: 0, paye: 0, reste: 0 });
      setSelected(new Set());
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [clientId, tCommon]);

  useEffect(() => {
    if (permLoading || !can("clients.read") || !clientId) return;
    void load();
  }, [permLoading, can, clientId, load]);

  const unpaidIds = useMemo(() => paniers.filter((p) => !p.paye).map((p) => p.id), [paniers]);

  const selectedMontant = useMemo(() => {
    let sum = 0;
    for (const p of paniers) {
      if (selected.has(p.id)) sum += p.montant_total;
    }
    return Math.round(sum * 100) / 100;
  }, [paniers, selected]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === unpaidIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unpaidIds));
    }
  }

  if (permLoading || !can("clients.read")) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <p className="text-slate-600">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Button
        component={AppLink}
        href="/clients"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{ textTransform: "none", mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
      >
        {t("backList")}
      </Button>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1, mb: 0.5 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600, flex: 1 }}>
          {client?.name ?? "—"}
        </Typography>
        {can("clients.write") && client && !client.is_system ? (
          <Button size="small" variant="outlined" onClick={() => setEditOpen(true)} sx={{ textTransform: "none" }}>
            {t("editClient")}
          </Button>
        ) : null}
      </Box>

      {client?.phone || client?.email ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {[client.phone, client.email].filter(Boolean).join(" · ")}
        </Typography>
      ) : (
        <Box sx={{ mb: 2 }} />
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3, display: "flex", flexWrap: "wrap", gap: 3 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t("total")}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {formatDh(totals.total)} DH
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t("paid")}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "success.main" }}>
            {formatDh(totals.paye)} DH
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t("remaining")}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "warning.main" }}>
            {formatDh(totals.reste)} DH
          </Typography>
        </Box>
      </Paper>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box className="flex justify-center py-8">
          <CircularProgress size={32} />
        </Box>
      ) : (
        <>
          <Box className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t("paniersTitle")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {can("clients.write") ? (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setLinkOpen(true)}
                  sx={{ textTransform: "none" }}
                >
                  {t("linkPanier")}
                </Button>
              ) : null}
              {unpaidIds.length > 0 && can("clients.write") ? (
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  disabled={selected.size === 0}
                  onClick={() => setPaiementOpen(true)}
                  sx={{ textTransform: "none" }}
                >
                  {t("addPayment")}
                </Button>
              ) : null}
            </Box>
          </Box>

          {unpaidIds.length > 1 ? (
            <Button size="small" onClick={toggleSelectAll} sx={{ textTransform: "none", mb: 1 }}>
              {selected.size === unpaidIds.length ? t("deselectAll") : t("selectAllUnpaid")}
            </Button>
          ) : null}

          <List disablePadding sx={{ mb: 4 }}>
            {paniers.map((p) => (
              <ListItem
                key={p.id}
                disablePadding
                sx={{
                  mb: 1,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: p.paye ? "success.light" : "warning.light",
                  bgcolor: p.paye ? "success.50" : "warning.50",
                }}
              >
                {!p.paye && can("clients.write") ? (
                  <ListItemIcon sx={{ minWidth: 42, pl: 1 }}>
                    <Checkbox
                      edge="start"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </ListItemIcon>
                ) : null}
                <ListItemButton
                  component={AppLink}
                  href={`/clients/${encodeURIComponent(clientId)}/paniers/${encodeURIComponent(p.id)}`}
                  sx={{ py: 1.25 }}
                >
                  <ListItemText
                    primary={p.label}
                    secondary={formatPanierSecondary(
                      p,
                      formatDateTime,
                      formatDh,
                      t("paidBadge"),
                      t("unpaidBadge"),
                      t("magasin"),
                      t("caisse"),
                    )}
                    slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {paniers.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                {t("noPaniers")}
              </Typography>
            ) : null}
          </List>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {t("paymentsTitle")}
          </Typography>
          {paiements.length === 0 ? (
            <Typography color="text.secondary">{t("noPayments")}</Typography>
          ) : (
            <List disablePadding>
              {paiements.map((p) => (
                <ListItem key={p.id} disablePadding sx={{ mb: 1 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, width: "100%" }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {formatDh(p.montant)} DH — {p.payment_method_label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {p.date_paiement}
                      {p.commentaire ? ` · ${p.commentaire}` : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t("paniersCount", { count: p.panier_ids.length })}
                    </Typography>
                  </Paper>
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}

      {client ? (
        <ClientFormDialog
          open={editOpen}
          client={client}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void load();
          }}
        />
      ) : null}

      <ClientPaiementFormDialog
        open={paiementOpen}
        clientId={clientId}
        panierIds={[...selected]}
        montant={selectedMontant}
        onClose={() => setPaiementOpen(false)}
        onSaved={() => {
          setPaiementOpen(false);
          void load();
        }}
      />

      {client ? (
        <ClientPanierLinkDialog
          open={linkOpen}
          fixedClientId={client.id}
          fixedClientName={client.name}
          onClose={() => setLinkOpen(false)}
          onSaved={() => {
            setLinkOpen(false);
            void load();
          }}
        />
      ) : null}
    </main>
  );
}
