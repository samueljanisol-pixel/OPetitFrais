"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
import FormDialog from "@/lib/mui/FormDialog";
import ClientFormDialog from "@/features/clients/ClientFormDialog";

type ClientOption = {
  id: string;
  name: string;
  phone: string | null;
};

type Props = {
  open: boolean;
  cartId: string;
  cartNumber: number;
  onClose: () => void;
  onSaved: () => void;
};

export default function CommandeClientLinkDialog({
  open,
  cartId,
  cartNumber,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("backoffice.commandesClient.linkDialog");
  const tCommon = useTranslations("common");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/clients");
    const json = (await res.json()) as {
      clients?: Array<{ id: string; name: string; phone: string | null }>;
      error?: string;
    };
    if (!res.ok) {
      setErr(typeof json.error === "string" ? json.error : tCommon("error"));
      setClients([]);
      return;
    }
    setClients(
      (json.clients ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      })),
    );
  }, [tCommon]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSelectedClient(null);
    void loadClients();
  }, [open, loadClients]);

  async function save() {
    const clientId = selectedClient?.id ?? "";
    if (!clientId) {
      setErr(t("selectionRequired"));
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/commandes-client/${encodeURIComponent(cartId)}/link-client`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 0.5 }}>
            {t("orderFixed", { number: cartNumber })}
          </Typography>

          {err ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          ) : null}

          <Autocomplete
            options={clients}
            getOptionLabel={(o) => (o.phone ? `${o.name} (${o.phone})` : o.name)}
            value={selectedClient}
            onChange={(_e, v) => setSelectedClient(v)}
            renderInput={(params) => (
              <TextField {...params} label={t("clientField")} sx={{ mb: 1 }} />
            )}
          />
          <Button
            size="small"
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: "none", mb: 1 }}
          >
            {t("createClient")}
          </Button>
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
          void loadClients();
        }}
      />
    </>
  );
}
