import { useEffect, useState } from "react";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  Typography,
} from "@mui/material";
import type { CaisseClient } from "@opf/caisse-core";
import FormDialog from "./FormDialog";
import AlphaKeyboard, { type AlphaKeyboardMode } from "./AlphaKeyboard";
import { createClientOnApi, updateClientOnApi } from "../lib/clients";

export type ClientFormField = "name" | "phone" | "email" | "notes";

export type ClientFormValues = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

type Props = {
  open: boolean;
  client: CaisseClient | null;
  onClose: () => void;
  onSaved: (client: CaisseClient) => void;
};

const emptyForm = (): ClientFormValues => ({
  name: "",
  phone: "",
  email: "",
  notes: "",
});

const FIELD_LABELS: Record<ClientFormField, string> = {
  name: "Nom",
  phone: "Téléphone",
  email: "Email",
  notes: "Notes",
};

function keyboardMode(field: ClientFormField): AlphaKeyboardMode {
  if (field === "phone") return "phone";
  if (field === "email") return "email";
  return "text";
}

export default function ClientFormDialog({ open, client, onClose, onSaved }: Props) {
  const isEdit = client != null;
  const [form, setForm] = useState<ClientFormValues>(emptyForm);
  const [activeField, setActiveField] = useState<ClientFormField>("name");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setActiveField("name");
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

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const appendToField = (key: string) => {
    if (key === "BACK") {
      setForm((f) => ({ ...f, [activeField]: f[activeField].slice(0, -1) }));
      return;
    }
    const char = key === " " ? " " : key;
    setForm((f) => ({ ...f, [activeField]: f[activeField] + char }));
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Nom requis");
      setActiveField("name");
      return;
    }

    setSaving(true);
    setError(null);

    if (isEdit && client) {
      const result = await updateClientOnApi(client.id, {
        name: client.isSystem ? undefined : name,
        phone: form.phone,
        email: form.email,
        notes: form.notes,
      });
      setSaving(false);
      if (result.error || !result.client) {
        setError(result.error ?? "Erreur enregistrement");
        return;
      }
      onSaved(result.client);
      onClose();
      return;
    }

    const result = await createClientOnApi({
      name,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
    });
    setSaving(false);
    if (result.error || !result.client) {
      setError(result.error ?? "Erreur création");
      return;
    }
    onSaved(result.client);
    onClose();
  };

  const displayValue = form[activeField];
  const nameLocked = isEdit && client?.isSystem === true && activeField === "name";

  return (
    <FormDialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? "Modifier le client" : "Nouveau client"}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error ? (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        ) : null}

        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={activeField}
          onChange={(_, v: ClientFormField | null) => v && setActiveField(v)}
          sx={{ mb: 1 }}
        >
          {(Object.keys(FIELD_LABELS) as ClientFormField[]).map((key) => (
            <ToggleButton key={key} value={key} sx={{ fontSize: 12, px: 1 }}>
              {FIELD_LABELS[key]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Typography variant="caption" color="text.secondary">
          {FIELD_LABELS[activeField]}
          {nameLocked ? " (non modifiable)" : ""}
        </Typography>
        <Typography
          variant="body1"
          sx={{
            bgcolor: "#f5f5f5",
            borderRadius: 1,
            px: 1,
            py: 0.75,
            mb: 1,
            minHeight: activeField === "notes" ? 56 : 36,
            fontFamily: "monospace",
            whiteSpace: activeField === "notes" ? "pre-wrap" : "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {displayValue || "—"}
        </Typography>

        <Box sx={{ opacity: nameLocked ? 0.5 : 1, pointerEvents: nameLocked ? "none" : "auto" }}>
          <AlphaKeyboard mode={keyboardMode(activeField)} onKey={appendToField} disabled={saving} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={saving}>
          Annuler
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <CircularProgress size={22} /> : "Enregistrer"}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
