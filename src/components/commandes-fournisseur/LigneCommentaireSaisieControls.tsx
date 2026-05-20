"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import CommentOutlinedIcon from "@mui/icons-material/CommentOutlined";
import LigneSaisieComments from "@/components/commandes-fournisseur/LigneSaisieComments";
import type { SaisieLigneTarget } from "@/lib/commandes-fournisseur/ligne-saisie-comments";

type Props = {
  lotId: string;
  productLabel?: string;
  targets: SaisieLigneTarget[];
  editable: boolean;
  disabled?: boolean;
  onUpdated: () => void | Promise<void>;
  /**
   * `inline` : bouton à droite du champ quantité ; pastille en dessous seulement si commentaire.
   * `stack` : pastille + bouton empilés (récap, achat).
   */
  layout?: "stack" | "inline";
  /** Contenu affiché à gauche du bouton (ex. champ qté) si `layout="inline"`. */
  leading?: ReactNode;
};

export default function LigneCommentaireSaisieControls({
  lotId,
  productLabel,
  targets,
  editable,
  disabled = false,
  onUpdated,
  layout = "stack",
  leading,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeLigneId, setActiveLigneId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const targetsWithComment = targets.filter((t) => t.lineComment && t.lineComment.trim().length > 0);

  const activeTarget = targets.find((t) => t.ligneId === activeLigneId) ?? targets[0] ?? null;

  const openDialog = useCallback(() => {
    if (targets.length === 0) {
      return;
    }
    const initial =
      targets.find((t) => t.lineComment && t.lineComment.trim().length > 0) ?? targets[0]!;
    setActiveLigneId(initial.ligneId);
    setDraft(initial.lineComment ?? "");
    setErr(null);
    setDialogOpen(true);
  }, [targets]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDraft("");
    setErr(null);
  }, []);

  const patchComment = useCallback(
    async (lineComment: string | null) => {
      const ligneId =
        activeLigneId.trim().length > 0
          ? activeLigneId
          : (targets.find((t) => t.lineComment?.trim()) ?? targets[0])?.ligneId;
      if (!ligneId) {
        setErr("Ligne commande introuvable pour ce commentaire.");
        return;
      }
      setSaving(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/commandes-fournisseur/lots/${lotId}/commentaire-ligne`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ligneId, lineComment }),
          },
        );
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(j.error ?? "Erreur");
        }
        closeDialog();
        await onUpdated();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
      } finally {
        setSaving(false);
      }
    },
    [activeLigneId, closeDialog, lotId, onUpdated, targets],
  );

  const save = useCallback(() => {
    void patchComment(draft.trim().length > 0 ? draft.trim() : null);
  }, [draft, patchComment]);

  const remove = useCallback(() => {
    void patchComment(null);
  }, [patchComment]);

  if (targets.length === 0) {
    if (layout === "inline" && leading != null) {
      return <>{leading}</>;
    }
    return null;
  }

  const hasComment = targetsWithComment.length > 0;
  const singleComment =
    targetsWithComment.length === 1 ? targetsWithComment[0]!.lineComment : null;

  const commentChip =
    hasComment &&
    (singleComment && targetsWithComment.length === 1 ? (
      <LigneSaisieComments comments={[]} lineComment={singleComment} variant="chip" />
    ) : (
      <LigneSaisieComments
        comments={targetsWithComment.map((t) => ({
          magasinLabel: t.magasinLabel,
          comment: t.lineComment!.trim(),
        }))}
        variant="chip"
      />
    ));

  const commentButton =
    editable ? (
      <IconButton
        type="button"
        size="small"
        color={hasComment ? "info" : "default"}
        aria-label={hasComment ? "Modifier le commentaire" : "Ajouter un commentaire"}
        onClick={openDialog}
        disabled={disabled || saving}
        sx={{ flexShrink: 0, mt: layout === "inline" ? 0 : 0.5 }}
      >
        <CommentOutlinedIcon fontSize="small" />
      </IconButton>
    ) : null;

  const controlsUi =
    layout === "inline" ? (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: hasComment ? 0.5 : 0,
          maxWidth: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 0.25,
            maxWidth: "100%",
          }}
        >
          {leading}
          {commentButton}
        </Box>
        {commentChip}
      </Box>
    ) : (
      <Box
        sx={{
          display: "flex",
          maxWidth: "100%",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          gap: 0.5,
          mt: 0.5,
        }}
      >
        {commentChip}
        {commentButton}
      </Box>
    );

  return (
    <>
      {controlsUi}

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 0.5 }}>
          {draft.trim().length > 0 || activeTarget?.lineComment
            ? "Commentaire ligne"
            : "Ajouter un commentaire"}
        </DialogTitle>
        <DialogContent>
          {productLabel ? (
            <Typography variant="subtitle2" className="!mb-2 !font-semibold">
              {productLabel}
            </Typography>
          ) : null}
          {targets.length > 1 ? (
            <Select
              fullWidth
              size="small"
              value={activeLigneId}
              onChange={(e) => {
                const lid = String(e.target.value);
                setActiveLigneId(lid);
                const t = targets.find((x) => x.ligneId === lid);
                setDraft(t?.lineComment ?? "");
              }}
              disabled={saving}
              className="!mb-2"
            >
              {targets.map((t) => (
                <MenuItem key={t.ligneId} value={t.ligneId}>
                  {t.magasinLabel}
                </MenuItem>
              ))}
            </Select>
          ) : null}
          {err ? (
            <Typography color="error" variant="body2" className="!mb-2">
              {err}
            </Typography>
          ) : null}
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            label="Commentaire"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            placeholder="Ex. préférence de calibrage, remplacement…"
          />
        </DialogContent>
        <DialogActions
          className="!px-3 !pb-2"
          sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}
        >
          {activeTarget?.lineComment && activeTarget.lineComment.trim().length > 0 ? (
            <Button
              type="button"
              color="error"
              disabled={saving}
              onClick={() => void remove()}
              sx={{ textTransform: "none" }}
            >
              {saving ? "…" : "Supprimer"}
            </Button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex gap-1">
            <Button
              type="button"
              color="inherit"
              onClick={closeDialog}
              sx={{ textTransform: "none" }}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="contained"
              disabled={saving}
              onClick={() => void save()}
              sx={{ textTransform: "none" }}
            >
              {saving ? "…" : "Enregistrer"}
            </Button>
          </div>
        </DialogActions>
      </Dialog>
    </>
  );
}
