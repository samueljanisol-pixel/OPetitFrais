"use client";

import FormDialog from "@/lib/mui/FormDialog";
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export type ClientFormValues = {
  name: string;
  phone: string;
  email: string;
  notes: string;
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

type Props = {
  open: boolean;
  client: ClientRecord | null;
  onClose: () => void;
  onSaved: (client: ClientRecord) => void;
};

const emptyForm = (): ClientFormValues => ({
  name: "",
  phone: "",
  email: "",
  notes: "",
});

export default function ClientFormDialog({ open, client, onClose, onSaved }: Props) {
  const t = useTranslations("backoffice.clients.form");
  const tCommon = useTranslations("common");
  const isEdit = client != null;
  const [form, setForm] = useState<ClientFormValues>(emptyForm());
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (client) {
      setForm({
        name: client.name,
        phone: client.phone ?? "",
        email: client.email ?? "",
        notes: client.notes ?? "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, client]);

  async function save() {
    const name = form.name.trim();
    if (!name) {
      setErr(t("nameRequired"));
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const body = {
        name,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      };

      const res = await fetch(isEdit ? `/api/clients/${encodeURIComponent(client!.id)}` : "/api/clients", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { client?: ClientRecord; error?: string };
      if (!res.ok || !json.client) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      onSaved(json.client);
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{isEdit ? t("titleEdit") : t("titleCreate")}</DialogTitle>
      <DialogContent>
        {err ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        ) : null}
        <TextField
          fullWidth
          required
          label={t("name")}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={client?.is_system === true}
          sx={{ mb: 2, mt: 0.5 }}
        />
        <TextField
          fullWidth
          label={t("phone")}
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label={t("email")}
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label={t("notes")}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {tCommon("cancel")}
        </Button>
        <Button variant="contained" color="success" disabled={saving} onClick={() => void save()}>
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
