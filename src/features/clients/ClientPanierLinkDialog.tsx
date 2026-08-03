"use client";

import FormDialog from "@/lib/mui/FormDialog";
import {
  Alert,
  Autocomplete,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import ClientFormDialog from "@/features/clients/ClientFormDialog";

type ClientOption = {
  id: string;
  name: string;
  phone: string | null;
};

type UnlinkedPanier = {
  id: string;
  cart_number: number;
  label: string;
  montant_total: number;
  submitted_at: string | null;
};

type Props = {
  open: boolean;
  /** Panier à rattacher (depuis liste). Si null, choix dans la liste des non rattachés. */
  panierId?: string | null;
  panierLabel?: string | null;
  /** Client cible fixe (depuis fiche client). */
  fixedClientId?: string | null;
  fixedClientName?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function ClientPanierLinkDialog({
  open,
  panierId = null,
  panierLabel = null,
  fixedClientId = null,
  fixedClientName = null,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("backoffice.clients.linkDialog");
  const tCommon = useTranslations("common");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [paniers, setPaniers] = useState<UnlinkedPanier[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [selectedPanier, setSelectedPanier] = useState<UnlinkedPanier | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [clientsRes, paniersRes] = await Promise.all([
      fetch("/api/clients"),
      panierId ? Promise.resolve(null) : fetch("/api/clients/paniers-boutique"),
    ]);

    const clientsJson = (await clientsRes.json()) as {
      clients?: Array<{ id: string; name: string; phone: string | null }>;
    };
    if (clientsRes.ok) {
      setClients(
        (clientsJson.clients ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
        })),
      );
    }

    if (paniersRes) {
      const paniersJson = (await paniersRes.json()) as { paniers?: UnlinkedPanier[] };
      if (paniersRes.ok) {
        setPaniers(paniersJson.paniers ?? []);
      }
    }
  }, [panierId]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSelectedClient(null);
    setSelectedPanier(null);
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !fixedClientId || !fixedClientName) return;
    setSelectedClient({ id: fixedClientId, name: fixedClientName, phone: null });
  }, [open, fixedClientId, fixedClientName]);

  useEffect(() => {
    if (!open || !panierId || !panierLabel) return;
    setSelectedPanier({
      id: panierId,
      cart_number: 0,
      label: panierLabel,
      montant_total: 0,
      submitted_at: null,
    });
  }, [open, panierId, panierLabel]);

  async function save() {
    const targetPanierId = panierId ?? selectedPanier?.id ?? "";
    const targetClientId = fixedClientId ?? selectedClient?.id ?? "";
    if (!targetPanierId || !targetClientId) {
      setErr(t("selectionRequired"));
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/clients/paniers/${encodeURIComponent(targetPanierId)}/link`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: targetClientId }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      onSaved();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <FormDialog
        open={open}
        onClose={() => {
          if (!saving) onClose();
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogContent>
          {err ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          ) : null}

          {!panierId ? (
            <Autocomplete
              options={paniers}
              getOptionLabel={(o) => `${o.label} — ${o.montant_total.toFixed(2)} DH`}
              value={selectedPanier}
              onChange={(_e, v) => setSelectedPanier(v)}
              renderInput={(params) => (
                <TextField {...params} label={t("panierField")} sx={{ mb: 2, mt: 0.5 }} />
              )}
            />
          ) : (
            <Typography variant="body2" sx={{ mb: 2, mt: 0.5 }}>
              {t("panierFixed", { label: panierLabel ?? "—" })}
            </Typography>
          )}

          {!fixedClientId ? (
            <>
              <Autocomplete
                options={clients}
                getOptionLabel={(o) =>
                  o.phone ? `${o.name} (${o.phone})` : o.name
                }
                value={selectedClient}
                onChange={(_e, v) => setSelectedClient(v)}
                renderInput={(params) => (
                  <TextField {...params} label={t("clientField")} sx={{ mb: 1 }} />
                )}
              />
              <Button size="small" onClick={() => setCreateOpen(true)} sx={{ textTransform: "none", mb: 1 }}>
                {t("createClient")}
              </Button>
            </>
          ) : (
            <Typography variant="body2">{t("clientFixed", { name: fixedClientName ?? "—" })}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button variant="contained" color="success" disabled={saving} onClick={() => void save()}>
            {saving ? tCommon("saving") : t("linkAction")}
          </Button>
        </DialogActions>
      </FormDialog>

      <ClientFormDialog
        open={createOpen}
        client={null}
        onClose={() => setCreateOpen(false)}
        onSaved={(client) => {
          setCreateOpen(false);
          setSelectedClient({ id: client.id, name: client.name, phone: client.phone });
          void load();
        }}
      />
    </>
  );
}
