"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from "@mui/material";

type Role = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_full_access: boolean;
};
type Permission = { id: string; key: string; description: string | null; module: string | null };
type RP = { role_id: string; permission_id: string };

export default function AdminRolesClient() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [links, setLinks] = useState<RP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", { credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { error?: string }).error ?? "Erreur");
      }
      const data = j as { roles: Role[]; permissions: Permission[]; role_permissions: RP[] };
      setRoles(data.roles ?? []);
      setPermissions(data.permissions ?? []);
      setLinks(data.role_permissions ?? []);
      setSelectedRoleId((prev) => {
        if (prev && data.roles?.some((r) => r.id === prev)) return prev;
        return data.roles?.[0]?.id ?? "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedRoleId), [roles, selectedRoleId]);

  const selectedPermIds = useMemo(() => {
    const set = new Set(links.filter((l) => l.role_id === selectedRoleId).map((l) => l.permission_id));
    return set;
  }, [links, selectedRoleId]);

  const togglePerm = (permissionId: string) => {
    if (!selectedRoleId || selectedRole?.is_full_access) return;
    setLinks((prev) => {
      const has = prev.some((l) => l.role_id === selectedRoleId && l.permission_id === permissionId);
      if (has) {
        return prev.filter((l) => !(l.role_id === selectedRoleId && l.permission_id === permissionId));
      }
      return [...prev, { role_id: selectedRoleId, permission_id: permissionId }];
    });
  };

  const saveMatrix = async () => {
    if (!selectedRoleId || selectedRole?.is_full_access) return;
    setSaving(true);
    setError(null);
    const permissionIds = links.filter((l) => l.role_id === selectedRoleId).map((l) => l.permission_id);
    const res = await fetch(`/api/admin/roles/${selectedRoleId}/permissions`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionIds }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError((j as { error?: string }).error ?? "Enregistrement impossible");
      return;
    }
    await load();
  };

  const saveRoleName = async () => {
    const r = roles.find((x) => x.id === selectedRoleId);
    if (!selectedRoleId || !r) return;
    const res = await fetch(`/api/admin/roles/${selectedRoleId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: r.name, description: r.description ?? "" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? "Erreur");
      return;
    }
    await load();
  };

  const createRole = async () => {
    const slug = newSlug.trim().toLowerCase().replace(/\s+/g, "_");
    const name = newName.trim();
    if (!slug || !name) {
      setError("Code (slug) et nom requis");
      return;
    }
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, name }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((j as { error?: string }).error ?? "Création impossible");
      return;
    }
    setNewSlug("");
    setNewName("");
    await load();
  };

  if (loading && !roles.length) {
    return <Typography>Chargement…</Typography>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Typography variant="h6" className="!font-semibold">
        Rôles & accès
      </Typography>
      {error ? (
        <Paper className="!border-rose-200 !bg-rose-50 !p-3">
          <Typography color="error">{error}</Typography>
        </Paper>
      ) : null}

      <Paper className="!p-4">
        <Typography variant="subtitle2" className="!mb-2 !font-semibold">
          Nouveau rôle
        </Typography>
        <div className="flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end">
          <TextField
            label="Code (slug, non modifiable après création)"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            size="small"
            helperText="ex: magasin_lyon"
          />
          <TextField label="Nom affiché" value={newName} onChange={(e) => setNewName(e.target.value)} size="small" fullWidth />
          <Button variant="contained" color="success" onClick={() => void createRole()} sx={{ textTransform: "none" }}>
            Créer
          </Button>
        </div>
      </Paper>

      <Paper className="!p-4">
        <Typography variant="subtitle2" className="!mb-2 !font-semibold">
          Rôle sélectionné
        </Typography>
        <div className="flex max-w-3xl flex-col gap-2 md:flex-row">
          <FormControl size="small" fullWidth>
            <InputLabel>Rôle</InputLabel>
            <Select
              label="Rôle"
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value as string)}
            >
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name} {r.is_full_access ? "(accès total)" : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
        {selectedRole ? (
          <div className="mt-3 flex max-w-xl flex-col gap-2">
            <TextField
              label="Nom"
              value={selectedRole.name}
              onChange={(e) => setRoles((prev) => prev.map((r) => (r.id === selectedRole.id ? { ...r, name: e.target.value } : r)))}
              size="small"
              fullWidth
            />
            <TextField
              label="Description"
              value={selectedRole.description ?? ""}
              onChange={(e) =>
                setRoles((prev) => prev.map((r) => (r.id === selectedRole.id ? { ...r, description: e.target.value } : r)))
              }
              size="small"
              fullWidth
            />
            <Typography variant="caption" className="!text-slate-600">
              Slug : <code>{selectedRole.slug}</code>
              {selectedRole.is_system ? " · rôle système" : ""}
              {selectedRole.is_full_access ? " · accès total (toutes les permissions)" : ""}
            </Typography>
            <Button variant="outlined" onClick={() => void saveRoleName()} sx={{ textTransform: "none", alignSelf: "flex-start" }}>
              Enregistrer nom / description
            </Button>
          </div>
        ) : null}
      </Paper>

      {selectedRole && !selectedRole.is_full_access ? (
        <Paper className="!p-4">
          <Typography variant="subtitle2" className="!mb-2 !font-semibold">
            Permissions
          </Typography>
          <div className="flex flex-col gap-0.5">
            {permissions.map((p) => (
              <FormControlLabel
                key={p.id}
                control={
                  <Checkbox
                    checked={selectedPermIds.has(p.id)}
                    onChange={() => togglePerm(p.id)}
                    size="small"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" className="!font-medium">
                      {p.key}
                    </Typography>
                    {p.description ? (
                      <Typography variant="caption" className="!text-slate-600">
                        {p.description}
                      </Typography>
                    ) : null}
                  </Box>
                }
              />
            ))}
          </div>
          <Button
            variant="contained"
            color="success"
            disabled={saving}
            onClick={() => void saveMatrix()}
            sx={{ textTransform: "none", mt: 2 }}
          >
            {saving ? "Enregistrement…" : "Enregistrer les accès"}
          </Button>
        </Paper>
      ) : selectedRole?.is_full_access ? (
        <Paper className="!p-4">
          <Typography variant="body2" className="!text-slate-600">
            Ce rôle a l&apos;accès total : la matrice ne s&apos;applique pas.
          </Typography>
        </Paper>
      ) : null}

      <Typography variant="caption" className="!text-slate-500">
        Membres par rôle : voir la page Utilisateurs.
      </Typography>
    </div>
  );
}
