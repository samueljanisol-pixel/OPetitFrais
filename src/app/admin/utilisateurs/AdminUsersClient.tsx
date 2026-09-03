"use client";

import { useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import FormDialog from "@/lib/mui/FormDialog";
import {
  Box,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";

type RoleRow = { id: string; name: string; slug: string };
type MagasinOpt = { id: string; code: string; nom: string };
type ProfileRow = {
  user_id: string;
  email: string;
  login: string | null;
  prenom: string;
  nom: string;
  phone: string | null;
  role_id: string;
  roles: RoleRow | null;
  magasins: MagasinOpt[];
  is_caissier: boolean;
  has_caisse_pin: boolean;
};

export default function AdminUsersClient() {
  const { canAdminMagasins } = useSessionPermissions();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [allMagasins, setAllMagasins] = useState<MagasinOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState("");
  const [createMagasinIds, setCreateMagasinIds] = useState<string[]>([]);
  const [createIsCaissier, setCreateIsCaissier] = useState(false);
  const [createCaissePin, setCreateCaissePin] = useState("");
  const [showCreateCaissePin, setShowCreateCaissePin] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editPrenom, setEditPrenom] = useState("");
  const [editNom, setEditNom] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLogin, setEditLogin] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editMagasinIds, setEditMagasinIds] = useState<string[]>([]);
  const [editIsCaissier, setEditIsCaissier] = useState(false);
  const [editHasCaissePin, setEditHasCaissePin] = useState(false);
  const [editCaissePin, setEditCaissePin] = useState("");
  const [showEditCaissePin, setShowEditCaissePin] = useState(false);

  const loadMagasins = async () => {
    if (!canAdminMagasins) return;
    try {
      const res = await fetch("/api/admin/magasins", { credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = (j as { magasins?: Array<{ id: string; code: string; nom: string }> }).magasins ?? [];
      setAllMagasins(list.map((m) => ({ id: m.id, code: m.code, nom: m.nom })));
    } catch {
      /* ignore */
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/admin/roles", { credentials: "include" }),
        fetch("/api/admin/profiles", { credentials: "include" }),
      ]);
      if (!rRes.ok) {
        const j = await rRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Erreur rôles");
      }
      if (!pRes.ok) {
        const j = await pRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Erreur utilisateurs");
      }
      const rJson = (await rRes.json()) as { roles: RoleRow[] };
      const pJson = (await pRes.json()) as { profiles: ProfileRow[] };
      setRoles(rJson.roles ?? []);
      setProfiles(
        (pJson.profiles ?? []).map((p) => ({
          ...p,
          magasins: p.magasins ?? [],
          is_caissier: p.is_caissier === true,
          has_caisse_pin: p.has_caisse_pin === true,
        })),
      );
      setRoleId((prev) => prev || rJson.roles?.[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial uniquement
  }, []);

  useEffect(() => {
    void loadMagasins();
  }, [canAdminMagasins]);

  const resetCreateForm = () => {
    setEmail("");
    setLogin("");
    setPassword("");
    setPrenom("");
    setNom("");
    setPhone("");
    setRoleId(roles[0]?.id ?? "");
    setCreateMagasinIds([]);
    setCreateIsCaissier(false);
    setCreateCaissePin("");
    setShowCreateCaissePin(false);
    setCreateError(null);
    setShowCreatePassword(false);
  };

  const openCreateDialog = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const closeCreateDialog = () => {
    if (createBusy) return;
    setCreateOpen(false);
    setCreateError(null);
  };

  const openEdit = (p: ProfileRow) => {
    setEditUserId(p.user_id);
    setEditPrenom(p.prenom ?? "");
    setEditNom(p.nom ?? "");
    setEditPhone(p.phone ?? "");
    setEditLogin(p.login ?? "");
    setEditPassword("");
    setShowEditPassword(false);
    setEditMagasinIds((p.magasins ?? []).map((m) => m.id));
    setEditIsCaissier(p.is_caissier === true);
    setEditHasCaissePin(p.has_caisse_pin === true);
    setEditCaissePin("");
    setShowEditCaissePin(false);
    setEditOpen(true);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editUserId) return;
    if (editIsCaissier) {
      const pinDigits = editCaissePin.replace(/\D/g, "");
      if ((!editHasCaissePin && pinDigits.length < 4) || (pinDigits.length > 0 && pinDigits.length < 4)) {
        setError("Code caisse : 4 à 8 chiffres");
        return;
      }
      if (canAdminMagasins && editMagasinIds.length === 0) {
        setError("Un caissier doit être rattaché à au moins un magasin");
        return;
      }
    }
    setEditSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      prenom: editPrenom.trim(),
      nom: editNom.trim(),
      login: editLogin.trim() || null,
      phone: editPhone.trim() || null,
    };
    if (editPassword.trim().length > 0) {
      payload.password = editPassword;
    }
    if (canAdminMagasins) {
      payload.magasin_ids = editMagasinIds;
    }
    payload.is_caissier = editIsCaissier;
    if (editCaissePin.trim().length > 0) {
      payload.caisse_pin = editCaissePin.trim();
    }
    const res = await fetch(`/api/admin/profiles/${editUserId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    setEditSaving(false);
    if (!res.ok) {
      setError((j as { error?: string }).error ?? "Enregistrement impossible");
      return;
    }
    setEditOpen(false);
    setEditUserId(null);
    await load();
  };

  const createUser = async () => {
    if (createIsCaissier) {
      if (createCaissePin.replace(/\D/g, "").length < 4) {
        setCreateError("Code caisse : 4 à 8 chiffres");
        return;
      }
      if (canAdminMagasins && createMagasinIds.length === 0) {
        setCreateError("Un caissier doit être rattaché à au moins un magasin");
        return;
      }
    }
    setCreateBusy(true);
    setCreateError(null);
    const createPayload: Record<string, unknown> = {
      email: email.trim() || undefined,
      login: login.trim() || undefined,
      password,
      prenom: prenom.trim(),
      nom: nom.trim(),
      phone: phone.trim() || null,
      role_id: roleId,
    };
    if (canAdminMagasins) {
      createPayload.magasin_ids = createMagasinIds;
    }
    createPayload.is_caissier = createIsCaissier;
    if (createCaissePin.trim().length > 0) {
      createPayload.caisse_pin = createCaissePin.trim();
    }
    const res = await fetch("/api/admin/profiles", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPayload),
    });
    const j = await res.json().catch(() => ({}));
    setCreateBusy(false);
    if (!res.ok) {
      setCreateError((j as { error?: string }).error ?? "Création impossible");
      return;
    }
    setCreateOpen(false);
    resetCreateForm();
    await load();
  };

  const changeRole = async (userId: string, newRoleId: string) => {
    const res = await fetch(`/api/admin/profiles/${userId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: newRoleId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? "Mise à jour impossible");
      return;
    }
    await load();
  };

  if (loading && !profiles.length) {
    return <Typography>Chargement…</Typography>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <Typography variant="h6" className="!font-semibold">
          Utilisateurs
        </Typography>
        <Button
          variant="contained"
          color="success"
          size="small"
          startIcon={<AddIcon />}
          onClick={openCreateDialog}
          sx={{ textTransform: "none" }}
        >
          Ajouter
        </Button>
      </div>
      {error ? (
        <Paper className="!border-rose-200 !bg-rose-50 !p-3">
          <Typography color="error">{error}</Typography>
        </Paper>
      ) : null}

      <FormDialog open={createOpen} onClose={closeCreateDialog} fullWidth maxWidth="sm">
        <DialogTitle>Nouvel utilisateur</DialogTitle>
        <DialogContent>
          <Typography variant="caption" className="!mb-2 !mt-1 !block !text-slate-600">
            Renseignez un e-mail <strong>ou</strong> un identifiant de connexion (login). Sans e-mail, un compte technique
            interne est créé pour permettre l&apos;accès aux données.
          </Typography>
          <div className="flex flex-col gap-2">
            <TextField
              autoFocus
              label="E-mail (optionnel)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="small"
              fullWidth
              disabled={createBusy}
            />
            <TextField
              label="Identifiant / login (optionnel)"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              size="small"
              fullWidth
              disabled={createBusy}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <TextField
                label="Prénom"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                size="small"
                fullWidth
                disabled={createBusy}
              />
              <TextField
                label="Nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                size="small"
                fullWidth
                disabled={createBusy}
              />
            </div>
            <TextField
              label="Téléphone WhatsApp"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              size="small"
              fullWidth
              disabled={createBusy}
              placeholder="212612345678"
              helperText="Optionnel — format international sans +"
            />
            <TextField
              label="Mot de passe initial"
              type={showCreatePassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              size="small"
              fullWidth
              disabled={createBusy}
              helperText="Minimum 6 caractères"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showCreatePassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        onClick={() => setShowCreatePassword((v) => !v)}
                        onMouseDown={(e) => e.preventDefault()}
                        edge="end"
                        size="small"
                        disabled={createBusy}
                      >
                        {showCreatePassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <FormControl size="small" fullWidth disabled={createBusy}>
              <InputLabel>Rôle</InputLabel>
              <Select label="Rôle" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {canAdminMagasins ? (
              <FormControl size="small" fullWidth disabled={createBusy}>
                <InputLabel id="create-magasins-label">Magasins</InputLabel>
                <Select
                  labelId="create-magasins-label"
                  multiple
                  value={createMagasinIds}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCreateMagasinIds(typeof v === "string" ? v.split(",") : (v as string[]));
                  }}
                  input={<OutlinedInput label="Magasins" />}
                  renderValue={(selected) =>
                    (selected as string[])
                      .map((id) => {
                        const m = allMagasins.find((x) => x.id === id);
                        return m ? m.nom.trim() || m.code : id;
                      })
                      .join(", ") || "Aucun (pas de restriction)"
                  }
                >
                  {allMagasins.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      <Checkbox checked={createMagasinIds.includes(m.id)} />
                      <ListItemText primary={m.nom.trim() || m.code} />
                    </MenuItem>
                  ))}
                </Select>
                <Typography variant="caption" color="text.secondary" className="!mt-1 !block">
                  Optionnel. Limite le périmètre magasin (CA, commandes…). Vide = pas de rattachement explicite.
                  Obligatoire si l&apos;utilisateur est caissier.
                </Typography>
              </FormControl>
            ) : null}
            <FormControlLabel
              control={
                <Checkbox
                  checked={createIsCaissier}
                  onChange={(e) => setCreateIsCaissier(e.target.checked)}
                  disabled={createBusy}
                />
              }
              label="Caissier (caisse Electron)"
            />
            {createIsCaissier ? (
              <TextField
                label="Code caisse"
                type={showCreateCaissePin ? "text" : "password"}
                value={createCaissePin}
                onChange={(e) => setCreateCaissePin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                size="small"
                fullWidth
                disabled={createBusy}
                inputMode="numeric"
                helperText="4 à 8 chiffres — distinct du mot de passe back-office"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showCreateCaissePin ? "Masquer le code caisse" : "Afficher le code caisse"}
                          onClick={() => setShowCreateCaissePin((v) => !v)}
                          onMouseDown={(e) => e.preventDefault()}
                          edge="end"
                          size="small"
                          disabled={createBusy}
                        >
                          {showCreateCaissePin ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            ) : null}
            {createError ? (
              <Typography color="error" variant="body2">
                {createError}
              </Typography>
            ) : null}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateDialog} disabled={createBusy} sx={{ textTransform: "none" }}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={createBusy}
            onClick={() => void createUser()}
            sx={{ textTransform: "none" }}
          >
            {createBusy ? "Création…" : "Créer"}
          </Button>
        </DialogActions>
      </FormDialog>

      <Paper className="!overflow-x-auto">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Téléphone</TableCell>
              <TableCell>E-mail / login</TableCell>
              <TableCell>Rôle</TableCell>
              <TableCell>Caisse</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.user_id}>
                <TableCell>
                  {p.prenom} {p.nom}
                </TableCell>
                <TableCell>{p.phone ?? "—"}</TableCell>
                <TableCell>
                  <Box className="text-xs">
                    {p.email}
                    {p.login ? (
                      <>
                        <br />
                        <span className="text-slate-600">login: {p.login}</span>
                      </>
                    ) : null}
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 160 }}>
                  <Select
                    size="small"
                    fullWidth
                    value={p.role_id}
                    onChange={(e) => void changeRole(p.user_id, e.target.value)}
                  >
                    {roles.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.name}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>{p.is_caissier ? "Oui" : "—"}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(p)} sx={{ textTransform: "none" }}>
                    Modifier
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <FormDialog open={editOpen} onClose={() => { if (!editSaving) setEditOpen(false) }} fullWidth maxWidth="sm">
        <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
        <DialogContent>
          <div className="mt-2 flex flex-col gap-2">
            <TextField label="Prénom" value={editPrenom} onChange={(e) => setEditPrenom(e.target.value)} size="small" fullWidth />
            <TextField label="Nom" value={editNom} onChange={(e) => setEditNom(e.target.value)} size="small" fullWidth />
            <TextField
              label="Téléphone WhatsApp"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              size="small"
              fullWidth
              placeholder="212612345678"
              helperText="Optionnel — format international sans +"
            />
            <TextField
              label="Identifiant / login"
              value={editLogin}
              onChange={(e) => setEditLogin(e.target.value)}
              size="small"
              fullWidth
              helperText="Laisser vide pour retirer le login (connexion par e-mail uniquement si e-mail connu)"
            />
            <TextField
              label="Nouveau mot de passe"
              type={showEditPassword ? "text" : "password"}
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              size="small"
              fullWidth
              helperText="Le mot de passe actuel n'est pas affichable (sécurité). Laissez vide pour ne pas le changer — min. 6 caractères si renseigné."
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showEditPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        onClick={() => setShowEditPassword((v) => !v)}
                        onMouseDown={(e) => e.preventDefault()}
                        edge="end"
                        size="small"
                        disabled={editSaving}
                      >
                        {showEditPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            {canAdminMagasins ? (
              <FormControl size="small" fullWidth>
                <InputLabel id="edit-magasins-label">Magasins</InputLabel>
                <Select
                  labelId="edit-magasins-label"
                  multiple
                  value={editMagasinIds}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditMagasinIds(typeof v === "string" ? v.split(",") : (v as string[]));
                  }}
                  input={<OutlinedInput label="Magasins" />}
                  renderValue={(selected) =>
                    (selected as string[])
                      .map((id) => {
                        const m = allMagasins.find((x) => x.id === id);
                        return m ? m.nom.trim() || m.code : id;
                      })
                      .join(", ") || "Aucun (pas de restriction)"
                  }
                >
                  {allMagasins.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      <Checkbox checked={editMagasinIds.includes(m.id)} />
                      <ListItemText primary={m.nom.trim() || m.code} />
                    </MenuItem>
                  ))}
                </Select>
                <Typography variant="caption" color="text.secondary" className="!mt-1 !block">
                  Vide = pas de rattachement explicite (administrateur : tous les magasins ; autres rôles : aucun magasin
                  lié). Obligatoire si l&apos;utilisateur est caissier.
                </Typography>
              </FormControl>
            ) : null}
            <FormControlLabel
              control={
                <Checkbox
                  checked={editIsCaissier}
                  onChange={(e) => setEditIsCaissier(e.target.checked)}
                  disabled={editSaving}
                />
              }
              label="Caissier (caisse Electron)"
            />
            {editIsCaissier ? (
              <TextField
                label="Code caisse"
                type={showEditCaissePin ? "text" : "password"}
                value={editCaissePin}
                onChange={(e) => setEditCaissePin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                size="small"
                fullWidth
                disabled={editSaving}
                inputMode="numeric"
                helperText={
                  editHasCaissePin
                    ? "Laisser vide pour conserver le code actuel — 4 à 8 chiffres si modifié"
                    : "4 à 8 chiffres — distinct du mot de passe back-office"
                }
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showEditCaissePin ? "Masquer le code caisse" : "Afficher le code caisse"}
                          onClick={() => setShowEditCaissePin((v) => !v)}
                          onMouseDown={(e) => e.preventDefault()}
                          edge="end"
                          size="small"
                          disabled={editSaving}
                        >
                          {showEditCaissePin ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            ) : null}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>
            Annuler
          </Button>
          <Button variant="contained" onClick={() => void saveEdit()} disabled={editSaving} color="success">
            {editSaving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogActions>
      </FormDialog>
    </div>
  );
}
