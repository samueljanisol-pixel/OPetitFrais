"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import type { ChauffeurProfile } from "@/lib/ref/chauffeur-setting";
import type { ChauffeurUserOption } from "@/lib/ref/chauffeur-server";

export default function ChauffeurAdminPanel() {
  const { canWriteParametres } = useSessionPermissions();
  const [users, setUsers] = useState<ChauffeurUserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [chauffeur, setChauffeur] = useState<ChauffeurProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [usersRes, chauffeurRes] = await Promise.all([
        fetch("/api/ref/chauffeur/users", { credentials: "include" }),
        fetch("/api/ref/chauffeur", { credentials: "include" }),
      ]);
      const usersJson = (await usersRes.json()) as { users?: ChauffeurUserOption[]; error?: string };
      const chauffeurJson = (await chauffeurRes.json()) as {
        userId?: string | null;
        chauffeur?: ChauffeurProfile | null;
        error?: string;
      };
      if (!usersRes.ok) {
        throw new Error(usersJson.error ?? "Impossible de charger les utilisateurs");
      }
      if (!chauffeurRes.ok) {
        throw new Error(chauffeurJson.error ?? "Impossible de charger le chauffeur");
      }
      setUsers(usersJson.users ?? []);
      const uid = chauffeurJson.userId ?? "";
      setSelectedUserId(uid);
      setChauffeur(chauffeurJson.chauffeur ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/ref/chauffeur", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId.trim().length > 0 ? selectedUserId : null }),
      });
      const j = (await res.json()) as { chauffeur?: ChauffeurProfile | null; error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? "Enregistrement impossible");
      }
      setChauffeur(j.chauffeur ?? null);
      setSavedMsg("Chauffeur enregistré.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = users.find((u) => u.userId === selectedUserId) ?? null;

  return (
    <Box className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
      <Typography variant="subtitle1" className="!mb-1 !font-semibold !text-slate-900">
        Chauffeur (WhatsApp)
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-3">
        Utilisateur contacté lors de l&apos;envoi WhatsApp depuis un lot prêt (export consolidation). Le téléphone se
        renseigne sur la fiche utilisateur (
        <AppLink href="/admin/utilisateurs" className="text-emerald-700 underline">
          Administration → Utilisateurs
        </AppLink>
        ).
      </Typography>
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Chargement…
        </Typography>
      ) : (
        <>
          <FormControl size="small" fullWidth disabled={!canWriteParametres || saving} className="!mb-2">
            <InputLabel id="chauffeur-user-label">Chauffeur</InputLabel>
            <Select
              labelId="chauffeur-user-label"
              label="Chauffeur"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(String(e.target.value))}
            >
              <MenuItem value="">
                <em>Aucun</em>
              </MenuItem>
              {users.map((u) => (
                <MenuItem key={u.userId} value={u.userId}>
                  {u.displayName}
                  {u.phone ? ` — ${u.phone}` : " — (sans téléphone)"}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {selectedUser && !selectedUser.phone ? (
            <Typography variant="caption" color="warning.main" className="!mb-2 block">
              Cet utilisateur n&apos;a pas de téléphone — ajoutez-en un dans Utilisateurs avant d&apos;envoyer WhatsApp.
            </Typography>
          ) : null}
          {chauffeur?.phone ? (
            <Typography variant="body2" color="text.secondary" className="!mb-2">
              Numéro actuel : <strong>{chauffeur.phone}</strong>
            </Typography>
          ) : null}
          {canWriteParametres ? (
            <Button
              variant="contained"
              color="success"
              size="small"
              disabled={saving}
              onClick={() => void save()}
              sx={{ textTransform: "none" }}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Lecture seule — droit « Modifier Paramètres » requis pour changer le chauffeur.
            </Typography>
          )}
        </>
      )}
      {savedMsg ? (
        <Typography variant="body2" color="success.main" className="!mt-2">
          {savedMsg}
        </Typography>
      ) : null}
      {err ? (
        <Typography variant="body2" color="error" className="!mt-2">
          {err}
        </Typography>
      ) : null}
    </Box>
  );
}
