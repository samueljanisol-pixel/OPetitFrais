"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import AppLink from "@/components/AppLink";
import ComptePaiementFormDialog from "@/features/commandes-fournisseur/ComptePaiementFormDialog";
import PaiementPhotosDialog from "@/features/commandes-fournisseur/PaiementPhotosDialog";
import PaiementRecapExporter, {
  type PaiementRecapExportHandle,
} from "@/features/commandes-fournisseur/PaiementRecapExporter";
import type { CompteAccountType } from "@/lib/commandes-fournisseur/compte-queries";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type AchatRow = {
  id: string;
  lot_id: string;
  label: string;
  montant_total: number;
  date_cloture: string;
  paye: boolean;
};

type PaiementRow = {
  id: string;
  payment_method_label: string;
  date_paiement: string;
  commentaire: string | null;
  montant: number;
  achat_ids: string[];
  photo_count: number;
};

type Totals = { total: number; paye: number; reste: number };

type Props = {
  accountType: CompteAccountType;
  accountId: string;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function accountApiPath(accountType: CompteAccountType, accountId: string): string {
  if (accountType === "vendeur") {
    return `/api/commandes-fournisseur/comptes/v/${encodeURIComponent(accountId)}`;
  }
  return `/api/commandes-fournisseur/comptes/s/${encodeURIComponent(accountId)}`;
}

export default function CompteDetailClient({ accountType, accountId }: Props) {
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.comptes.detail");
  const tCommon = useTranslations("common");
  const { formatDate } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();

  const [accountLabel, setAccountLabel] = useState("");
  const [parentLabel, setParentLabel] = useState<string | null>(null);
  const [achats, setAchats] = useState<AchatRow[]>([]);
  const [paiements, setPaiements] = useState<PaiementRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ total: 0, paye: 0, reste: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paiementOpen, setPaiementOpen] = useState(false);
  const [photosPaiementId, setPhotosPaiementId] = useState<string | null>(null);
  const [photosPaymentLabel, setPhotosPaymentLabel] = useState("");
  const [whatsappAvailable, setWhatsappAvailable] = useState(false);
  const [exportBusyId, setExportBusyId] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const recapExporterRef = useRef<PaiementRecapExportHandle>(null);

  useEffect(() => {
    if (!permLoading && !can("commandes_fournisseur.comptes")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(accountApiPath(accountType, accountId));
      const json = (await res.json()) as {
        account?: {
          label?: string;
          parent_supplier_label?: string;
          whatsapp_available?: boolean;
        };
        achats?: AchatRow[];
        paiements?: PaiementRow[];
        totals?: Totals;
        error?: string;
      };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setAccountLabel(json.account?.label ?? "—");
      setParentLabel(json.account?.parent_supplier_label ?? null);
      setWhatsappAvailable(Boolean(json.account?.whatsapp_available));
      setAchats(json.achats ?? []);
      setPaiements(json.paiements ?? []);
      setTotals(json.totals ?? { total: 0, paye: 0, reste: 0 });
      setSelected(new Set());
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [accountType, accountId, tCommon]);

  useEffect(() => {
    if (permLoading || !can("commandes_fournisseur.comptes") || !accountId) return;
    void load();
  }, [permLoading, can, accountId, load]);

  const unpaidIds = useMemo(() => achats.filter((a) => !a.paye).map((a) => a.id), [achats]);

  const selectedMontant = useMemo(() => {
    let sum = 0;
    for (const a of achats) {
      if (selected.has(a.id)) sum += a.montant_total;
    }
    return Math.round(sum * 100) / 100;
  }, [achats, selected]);

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

  async function downloadRecap(paiementId: string) {
    setExportErr(null);
    setExportBusyId(paiementId);
    try {
      const result = await recapExporterRef.current?.downloadRecap(paiementId);
      if (result && !result.ok) {
        setExportErr(result.error);
      }
    } finally {
      setExportBusyId(null);
    }
  }

  async function sendRecapWhatsApp(paiementId: string) {
    setExportErr(null);
    setExportBusyId(paiementId);
    try {
      const result = await recapExporterRef.current?.sendWhatsApp(paiementId);
      if (result && !result.ok) {
        setExportErr(result.error);
      }
    } finally {
      setExportBusyId(null);
    }
  }

  async function handleSavedAndSend(paiementId: string) {
    setPaiementOpen(false);
    await sendRecapWhatsApp(paiementId);
    void load();
  }

  if (permLoading || !can("commandes_fournisseur.comptes")) {
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
        href="/commandes-fournisseur/comptes"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{ textTransform: "none", mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
      >
        {t("backList")}
      </Button>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {accountLabel}
      </Typography>
      {parentLabel ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("parentSupplier", { label: parentLabel })}
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
      {exportErr ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportErr(null)}>
          {exportErr}
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
              {t("achatsTitle")}
            </Typography>
            {unpaidIds.length > 0 ? (
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

          {unpaidIds.length > 1 ? (
            <Button size="small" onClick={toggleSelectAll} sx={{ textTransform: "none", mb: 1 }}>
              {selected.size === unpaidIds.length ? t("deselectAll") : t("selectAllUnpaid")}
            </Button>
          ) : null}

          <List disablePadding sx={{ mb: 4 }}>
            {achats.map((a) => (
              <ListItem
                key={a.id}
                disablePadding
                sx={{
                  mb: 1,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: a.paye ? "success.light" : "warning.light",
                  bgcolor: a.paye ? "success.50" : "warning.50",
                }}
              >
                {!a.paye ? (
                  <ListItemIcon sx={{ minWidth: 42, pl: 1 }}>
                    <Checkbox
                      edge="start"
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                    />
                  </ListItemIcon>
                ) : null}
                <ListItemButton
                  component={AppLink}
                  href={`/commandes-fournisseur/comptes/achats/${encodeURIComponent(a.id)}`}
                  sx={{ py: 1.25 }}
                >
                  <ListItemText
                    primary={formatDate(a.date_cloture)}
                    secondary={
                      <>
                        {formatDh(a.montant_total)} DH
                        {a.paye ? ` · ${t("paidBadge")}` : ` · ${t("unpaidBadge")}`}
                      </>
                    }
                    slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {achats.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                {t("noAchats")}
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
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: { xs: "column", sm: "row" },
                        alignItems: { xs: "stretch", sm: "flex-start" },
                        justifyContent: "space-between",
                        gap: 2,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600 }}>
                          {formatDh(p.montant)} DH — {p.payment_method_label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {p.date_paiement}
                          {p.commentaire ? ` · ${p.commentaire}` : ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t("achatsCount", { count: p.achat_ids.length })}
                          {p.photo_count > 0
                            ? ` · ${t("photosCount", { count: p.photo_count })}`
                            : ""}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 1,
                          width: { xs: "100%", sm: "auto" },
                          flexShrink: 0,
                        }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={
                            exportBusyId === p.id ? (
                              <CircularProgress size={14} color="inherit" />
                            ) : (
                              <ImageOutlinedIcon fontSize="small" />
                            )
                          }
                          disabled={exportBusyId != null}
                          onClick={() => void downloadRecap(p.id)}
                          sx={{
                            textTransform: "none",
                            flex: { xs: "1 1 calc(50% - 4px)", sm: "0 0 auto" },
                            minWidth: { xs: 0, sm: "auto" },
                          }}
                        >
                          {t("downloadRecap")}
                        </Button>
                        {whatsappAvailable ? (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={
                              exportBusyId === p.id ? (
                                <CircularProgress size={14} color="inherit" />
                              ) : (
                                <WhatsAppIcon fontSize="small" />
                              )
                            }
                            disabled={exportBusyId != null}
                            onClick={() => void sendRecapWhatsApp(p.id)}
                            sx={{
                              textTransform: "none",
                              flex: { xs: "1 1 calc(50% - 4px)", sm: "0 0 auto" },
                              minWidth: { xs: 0, sm: "auto" },
                            }}
                          >
                            {t("sendRecapWhatsApp")}
                          </Button>
                        ) : null}
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setPhotosPaiementId(p.id);
                            setPhotosPaymentLabel(
                              `${formatDh(p.montant)} DH — ${p.payment_method_label}`,
                            );
                          }}
                          sx={{
                            textTransform: "none",
                            flex: {
                              xs: whatsappAvailable ? "1 1 100%" : "1 1 calc(50% - 4px)",
                              sm: "0 0 auto",
                            },
                            minWidth: { xs: 0, sm: "auto" },
                          }}
                        >
                          {t("managePhotos")}
                        </Button>
                      </Box>
                    </Box>
                  </Paper>
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}

      <ComptePaiementFormDialog
        open={paiementOpen}
        accountType={accountType}
        accountId={accountId}
        achatIds={[...selected]}
        montant={selectedMontant}
        whatsappAvailable={whatsappAvailable}
        onClose={() => setPaiementOpen(false)}
        onSaved={() => {
          setPaiementOpen(false);
          void load();
        }}
        onSavedAndSend={whatsappAvailable ? handleSavedAndSend : undefined}
      />

      <PaiementRecapExporter ref={recapExporterRef} />

      {photosPaiementId ? (
        <PaiementPhotosDialog
          open={photosPaiementId != null}
          paiementId={photosPaiementId}
          paymentLabel={photosPaymentLabel}
          onClose={() => setPhotosPaiementId(null)}
          onChanged={() => void load()}
          labels={{
            title: t("photosDialogTitle"),
            empty: t("photosEmpty"),
            camera: t("photoCamera"),
            gallery: t("photoGallery"),
            close: tCommon("close"),
            deleteAria: t("photoDeleteAria"),
          }}
        />
      ) : null}
    </main>
  );
}
