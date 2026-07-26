"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import type { TranslationRowDto, TranslationSection } from "@/lib/i18n/message-catalog";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useLocaleClient } from "@/lib/i18n/locale-client";
import type { AppLocale } from "@/i18n/config";

type EditableRow = TranslationRowDto & {
  draftFr: string;
  draftAr: string;
};

function rowChanged(row: EditableRow): boolean {
  return row.draftFr !== row.valueFr || row.draftAr !== row.valueAr;
}

function isOverrideValue(locale: AppLocale, messageKey: string, draft: string, defaultVal: string): boolean {
  return draft.trim() !== defaultVal.trim();
}

export default function TranslationsAdminPanel() {
  const { canWriteParametres, isAdministrator } = useSessionPermissions();
  const canEdit = canWriteParametres || isAdministrator;
  const { refreshMessages } = useLocaleClient();

  const [sections, setSections] = useState<TranslationSection[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ref/ui-translations/sections", { credentials: "include" });
        const j = (await res.json()) as { sections?: TranslationSection[]; error?: string };
        if (!res.ok) {
          setErr(j.error ?? "Erreur");
          return;
        }
        const list = j.sections ?? [];
        setSections(list);
        if (list.length > 0) {
          setSectionId(list[0].id);
        }
      } catch {
        setErr("Réseau indisponible");
      }
    })();
  }, []);

  const loadSection = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(
        `/api/ref/ui-translations/section?sectionId=${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as { rows?: TranslationRowDto[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erreur");
        setRows([]);
        return;
      }
      setRows(
        (j.rows ?? []).map((r) => ({
          ...r,
          draftFr: r.valueFr,
          draftAr: r.valueAr,
        })),
      );
    } catch {
      setErr("Réseau indisponible");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sectionId) void loadSection(sectionId);
  }, [sectionId, loadSection]);

  const changedRows = useMemo(() => rows.filter(rowChanged), [rows]);

  const save = async () => {
    if (!canEdit || changedRows.length === 0) return;
    setSaving(true);
    setErr(null);
    setOk(null);

    const upserts: Array<{ message_key: string; locale: AppLocale; value: string }> = [];
    const deletes: Array<{ message_key: string; locale: AppLocale }> = [];

    for (const row of changedRows) {
      const key = row.messageKey;
      const defFr = row.defaultFr;
      const defAr = row.defaultAr;

      if (isOverrideValue("fr", key, row.draftFr, defFr)) {
        upserts.push({ message_key: key, locale: "fr", value: row.draftFr.trim() });
      } else if (row.overriddenFr) {
        deletes.push({ message_key: key, locale: "fr" });
      }

      if (isOverrideValue("ar-MA", key, row.draftAr, defAr)) {
        upserts.push({ message_key: key, locale: "ar-MA", value: row.draftAr.trim() });
      } else if (row.overriddenAr) {
        deletes.push({ message_key: key, locale: "ar-MA" });
      }
    }

    try {
      const res = await fetch("/api/ref/ui-translations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ upserts, deletes }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Enregistrement impossible");
        return;
      }
      await refreshMessages();
      setOk("Traductions enregistrées. L’interface a été mise à jour.");
      await loadSection(sectionId);
    } catch {
      setErr("Réseau indisponible");
    } finally {
      setSaving(false);
    }
  };

  const resetRow = (messageKey: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.messageKey === messageKey
          ? { ...r, draftFr: r.defaultFr, draftAr: r.defaultAr }
          : r,
      ),
    );
  };

  const currentSection = sections.find((s) => s.id === sectionId);

  return (
    <div className="flex flex-col gap-4">
      <Typography variant="body2" color="text.secondary">
        Modifiez les textes affichés dans l&apos;application, organisés par page ou zone. Les valeurs par
        défaut viennent des fichiers de traduction ; une modification ici remplace l&apos;affichage sans
        redéployer le code.
      </Typography>

      {!canEdit ? (
        <Alert severity="info">Lecture seule : droit « Modifier Paramètres » requis pour enregistrer.</Alert>
      ) : null}

      <FormControl size="small" fullWidth sx={{ maxWidth: 420 }}>
        <InputLabel id="i18n-section-label">Page / zone</InputLabel>
        <Select
          labelId="i18n-section-label"
          label="Page / zone"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
        >
          {sections.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {currentSection ? (
        <Typography variant="caption" color="text.secondary" component="p">
          Clés : <code className="text-xs">{currentSection.prefix}.*</code> — {rows.length} entrée
          {rows.length > 1 ? "s" : ""}
        </Typography>
      ) : null}

      {err ? <Alert severity="error">{err}</Alert> : null}
      {ok ? <Alert severity="success">{ok}</Alert> : null}

      {loading ? (
        <Box className="flex justify-center py-8">
          <CircularProgress size={28} />
        </Box>
      ) : (
        <div className="overflow-auto max-h-[min(70vh,640px)] border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-slate-900">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr className="text-left text-xs font-semibold uppercase text-slate-700">
                <th className="p-2 w-[28%]">Clé</th>
                <th className="p-2 w-[36%]">Français</th>
                <th className="p-2 w-[36%]">Darija (arabe)</th>
                <th className="p-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const shortKey = row.messageKey.split(".").slice(-2).join(".");
                const changed = rowChanged(row);
                return (
                  <tr
                    key={row.messageKey}
                    className={`border-t border-slate-100 ${changed ? "bg-amber-50/60" : ""}`}
                  >
                    <td className="p-2 align-top">
                      <span className="font-mono text-xs text-slate-600" title={row.messageKey}>
                        {shortKey}
                      </span>
                      {(row.overriddenFr || row.overriddenAr) && !changed ? (
                        <span className="mt-0.5 block text-[10px] text-emerald-700">surcharge</span>
                      ) : null}
                    </td>
                    <td className="p-2 align-top">
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        minRows={1}
                        maxRows={4}
                        disabled={!canEdit}
                        value={row.draftFr}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.messageKey === row.messageKey ? { ...r, draftFr: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder={row.defaultFr}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        minRows={1}
                        maxRows={4}
                        disabled={!canEdit}
                        value={row.draftAr}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.messageKey === row.messageKey ? { ...r, draftAr: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder={row.defaultAr}
                        slotProps={{ input: { dir: "rtl" } }}
                      />
                    </td>
                    <td className="p-2 align-top text-right">
                      {canEdit ? (
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => resetRow(row.messageKey)}
                          sx={{ textTransform: "none", minWidth: 0, px: 0.5 }}
                          title="Rétablir les textes par défaut"
                        >
                          ↺
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="contained"
            color="success"
            disabled={saving || changedRows.length === 0}
            onClick={() => void save()}
            sx={{ textTransform: "none" }}
          >
            {saving ? "Enregistrement…" : `Enregistrer${changedRows.length > 0 ? ` (${changedRows.length})` : ""}`}
          </Button>
          <Button
            variant="outlined"
            disabled={loading || !sectionId}
            onClick={() => void loadSection(sectionId)}
            sx={{ textTransform: "none" }}
          >
            Actualiser
          </Button>
        </div>
      ) : null}
    </div>
  );
}
