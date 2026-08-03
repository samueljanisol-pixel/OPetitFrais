"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import AppLink from "@/components/AppLink";
import SalarieDocumentsPanel from "@/features/salaries/SalarieDocumentsPanel";
import SalarieEvenementFormDialog from "@/features/salaries/SalarieEvenementFormDialog";
import SalarieHorairesGrid, { horairesToInputs } from "@/features/salaries/SalarieHorairesGrid";
import SalariePaiementFormDialog from "@/features/salaries/SalariePaiementFormDialog";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import { todayIsoDate } from "@/lib/salaries/planning";
import type {
  HoraireInput,
  SalarieDocumentRow,
  SalarieEvenementRow,
  SalarieHoraireRow,
  SalarieListItem,
  SalariePaiementRow,
  SalariePaiementSummary,
} from "@/lib/salaries/types";

function evenementKindLabel(kind: SalarieEvenementRow["kind"], tEv: (k: string) => string): string {
  if (kind === "malade") return tEv("kindMalade");
  if (kind === "conge") return tEv("kindConge");
  return tEv("kindAutre");
}

type Props = {
  salarieId: string;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function SalarieDetailClient({ salarieId }: Props) {
  const router = useRouter();
  const t = useTranslations("backoffice.salaries.detail");
  const tEv = useTranslations("backoffice.salaries.evenements");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can, linkedMagasins } = useSessionPermissions();
  const canWrite = can("salaries.write");

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [salarie, setSalarie] = useState<SalarieListItem | null>(null);
  const [documents, setDocuments] = useState<SalarieDocumentRow[]>([]);
  const [paiements, setPaiements] = useState<SalariePaiementRow[]>([]);
  const [summary, setSummary] = useState<SalariePaiementSummary>({
    total_salaires: 0,
    total_avances: 0,
    solde: 0,
  });
  const [evenements, setEvenements] = useState<SalarieEvenementRow[]>([]);
  const [horaires, setHoraires] = useState<SalarieHoraireRow[]>([]);

  const [magasinId, setMagasinId] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [dateArrivee, setDateArrivee] = useState("");
  const [dateDepart, setDateDepart] = useState("");
  const [notes, setNotes] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [evOpen, setEvOpen] = useState(false);
  const [departOpen, setDepartOpen] = useState(false);
  const [departDate, setDepartDate] = useState(todayIsoDate());
  const [horaireDraft, setHoraireDraft] = useState<HoraireInput[] | null>(null);
  const [savingHoraires, setSavingHoraires] = useState(false);

  useEffect(() => {
    if (!permLoading && !can("salaries.read")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        error?: string;
        salarie?: SalarieListItem;
        documents?: SalarieDocumentRow[];
        paiements?: SalariePaiementRow[];
        paiementSummary?: SalariePaiementSummary;
        evenements?: SalarieEvenementRow[];
        horaires?: SalarieHoraireRow[];
      };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        return;
      }
      const s = json.salarie ?? null;
      setSalarie(s);
      if (s) {
        setMagasinId(s.magasin_id);
        setNom(s.nom ?? "");
        setPrenom(s.prenom);
        setDateArrivee(s.date_arrivee);
        setDateDepart(s.date_depart ?? "");
        setNotes(s.notes ?? "");
      }
      setDocuments(json.documents ?? []);
      setPaiements(json.paiements ?? []);
      setSummary(json.paiementSummary ?? { total_salaires: 0, total_avances: 0, solde: 0 });
      setEvenements(json.evenements ?? []);
      setHoraires(json.horaires ?? []);
      setHoraireDraft(null);
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [salarieId, tCommon]);

  useEffect(() => {
    if (permLoading || !can("salaries.read")) return;
    void load();
  }, [permLoading, can, load]);

  async function saveInfo() {
    if (!canWrite) return;
    setSavingInfo(true);
    setErr(null);
    try {
      const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          magasin_id: magasinId,
          nom: nom.trim() || null,
          prenom: prenom.trim(),
          date_arrivee: dateArrivee,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        return;
      }
      void load();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setSavingInfo(false);
    }
  }

  async function confirmDepart() {
    setSavingInfo(true);
    try {
      const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ date_depart: departDate }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setErr(json.error ?? tCommon("error"));
        return;
      }
      setDepartOpen(false);
      void load();
    } finally {
      setSavingInfo(false);
    }
  }

  async function reactivate() {
    const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ date_depart: null }),
    });
    if (res.ok) void load();
  }

  async function deletePaiement(paiementId: string) {
    const res = await fetch(
      `/api/salaries/${encodeURIComponent(salarieId)}/paiements/${encodeURIComponent(paiementId)}`,
      { method: "DELETE", credentials: "include" },
    );
    if (res.ok) void load();
  }

  async function deleteEvenement(evenementId: string) {
    const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}/evenements`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ evenementId }),
    });
    if (res.ok) void load();
  }

  async function saveHoraires() {
    const items = horaireDraft ?? horairesToInputs(horaires);
    setSavingHoraires(true);
    try {
      const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}/horaires`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ horaires: items }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setErr(json.error ?? tCommon("error"));
        return;
      }
      void load();
    } finally {
      setSavingHoraires(false);
    }
  }

  const readOnly = !canWrite || (salarie != null && !salarie.actif);

  if (loading && !salarie) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Button startIcon={<BackChevron fontSize="small" />} component={AppLink} href="/salaries" sx={{ mb: 2 }}>
        {t("backList")}
      </Button>

      {salarie ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <Typography variant="h5" component="h1">
            {salarie.prenom}
            {salarie.nom ? ` ${salarie.nom}` : ""}
          </Typography>
          <Chip
            size="small"
            label={salarie.actif ? t("actif") : t("parti")}
            color={salarie.actif ? "success" : "default"}
          />
          {salarie.magasin_nom ? (
            <Typography variant="body2" color="text.secondary">
              {salarie.magasin_nom}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={t("tabInfo")} />
        <Tab label={t("tabDocuments")} />
        <Tab label={t("tabPaiements")} />
        <Tab label={t("tabEvenements")} />
        <Tab label={t("tabHoraires")} />
      </Tabs>

      {tab === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          {linkedMagasins.length > 0 ? (
            <FormControl fullWidth margin="normal" disabled={readOnly || linkedMagasins.length <= 1}>
              <InputLabel id="salarie-site-label">{t("site")}</InputLabel>
              <Select
                labelId="salarie-site-label"
                label={t("site")}
                value={magasinId}
                onChange={(e) => setMagasinId(e.target.value)}
              >
                {linkedMagasins.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.nom} ({m.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
          <TextField
            label={t("nom")}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            fullWidth
            margin="normal"
            disabled={readOnly}
          />
          <TextField
            label={t("prenom")}
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            fullWidth
            margin="normal"
            disabled={readOnly}
          />
          <TextField
            label={t("dateArrivee")}
            type="date"
            value={dateArrivee}
            onChange={(e) => setDateArrivee(e.target.value)}
            fullWidth
            margin="normal"
            slotProps={{ inputLabel: { shrink: true } }}
            disabled={readOnly}
          />
          {dateDepart ? (
            <TextField
              label={t("dateDepart")}
              type="date"
              value={dateDepart}
              fullWidth
              margin="normal"
              slotProps={{ inputLabel: { shrink: true } }}
              disabled
            />
          ) : null}
          <TextField
            label={t("notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            margin="normal"
            multiline
            minRows={3}
            disabled={readOnly}
          />
          {canWrite && salarie?.actif ? (
            <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
              <Button variant="contained" onClick={() => void saveInfo()} disabled={savingInfo}>
                {savingInfo ? tCommon("saving") : tCommon("save")}
              </Button>
              <Button variant="outlined" color="warning" onClick={() => setDepartOpen(true)}>
                {t("setDepart")}
              </Button>
            </Box>
          ) : null}
          {canWrite && salarie && !salarie.actif ? (
            <Button sx={{ mt: 2 }} onClick={() => void reactivate()}>
              {t("reactivate")}
            </Button>
          ) : null}
        </Paper>
      ) : null}

      {tab === 1 ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <SalarieDocumentsPanel
            salarieId={salarieId}
            documents={documents}
            canEdit={Boolean(canWrite && salarie?.actif)}
            onChanged={() => void load()}
          />
        </Paper>
      ) : null}

      {tab === 2 ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
            <Chip label={`${t("totalSalaires")} : ${formatDh(summary.total_salaires)} DH`} />
            <Chip label={`${t("totalAvances")} : ${formatDh(summary.total_avances)} DH`} />
            <Chip label={`${t("solde")} : ${formatDh(summary.solde)} DH`} color="primary" />
          </Box>
          {canWrite && salarie?.actif ? (
            <Button variant="contained" sx={{ mb: 2 }} onClick={() => setPayOpen(true)}>
              {t("addPaiement")}
            </Button>
          ) : null}
          <List>
            {paiements.map((p) => (
              <ListItem
                key={p.id}
                secondaryAction={
                  canWrite ? (
                    <IconButton edge="end" onClick={() => void deletePaiement(p.id)}>
                      <DeleteOutlineOutlinedIcon />
                    </IconButton>
                  ) : null
                }
              >
                <ListItemText
                  primary={`${p.kind === "salaire" ? t("kindSalaire") : t("kindAvance")} — ${formatDh(p.montant)} DH`}
                  secondary={`${p.date_paiement}${p.payment_method_label ? ` · ${p.payment_method_label}` : ""}${p.commentaire ? ` · ${p.commentaire}` : ""}`}
                />
              </ListItem>
            ))}
          </List>
          {paiements.length === 0 ? (
            <Typography color="text.secondary">{t("noPaiements")}</Typography>
          ) : null}
        </Paper>
      ) : null}

      {tab === 3 ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {canWrite && salarie?.actif ? (
            <Button variant="contained" sx={{ mb: 2 }} onClick={() => setEvOpen(true)}>
              {t("addEvenement")}
            </Button>
          ) : null}
          <List>
            {evenements.map((e) => (
              <ListItem
                key={e.id}
                secondaryAction={
                  canWrite ? (
                    <IconButton edge="end" onClick={() => void deleteEvenement(e.id)}>
                      <DeleteOutlineOutlinedIcon />
                    </IconButton>
                  ) : null
                }
              >
                <ListItemText
                  primary={evenementKindLabel(e.kind, tEv)}
                  secondary={`${e.date_debut} → ${e.date_fin}${e.commentaire ? ` · ${e.commentaire}` : ""}`}
                />
              </ListItem>
            ))}
          </List>
          {evenements.length === 0 ? (
            <Typography color="text.secondary">{t("noEvenements")}</Typography>
          ) : null}
        </Paper>
      ) : null}

      {tab === 4 ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <SalarieHorairesGrid
            horaires={horaires}
            readOnly={readOnly}
            onChange={canWrite && salarie?.actif ? setHoraireDraft : undefined}
          />
          {canWrite && salarie?.actif ? (
            <Button
              variant="contained"
              sx={{ mt: 2 }}
              onClick={() => void saveHoraires()}
              disabled={savingHoraires}
            >
              {savingHoraires ? tCommon("saving") : tCommon("save")}
            </Button>
          ) : null}
        </Paper>
      ) : null}

      <SalariePaiementFormDialog
        open={payOpen}
        salarieId={salarieId}
        onClose={() => setPayOpen(false)}
        onSaved={() => void load()}
      />
      <SalarieEvenementFormDialog
        open={evOpen}
        salarieId={salarieId}
        onClose={() => setEvOpen(false)}
        onSaved={() => void load()}
      />

      <Dialog open={departOpen} onClose={() => !savingInfo && setDepartOpen(false)}>
        <DialogTitle>{t("departTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            label={t("dateDepart")}
            type="date"
            value={departDate}
            onChange={(e) => setDepartDate(e.target.value)}
            fullWidth
            margin="normal"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDepartOpen(false)}>{tCommon("cancel")}</Button>
          <Button variant="contained" color="warning" onClick={() => void confirmDepart()}>
            {t("confirmDepart")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
