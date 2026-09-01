"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import AppLink from "@/components/AppLink";
import AchatVendeurCommentDialog from "@/features/commandes-fournisseur/AchatVendeurCommentDialog";
import AchatVendeurPhotosDialog, {
  type AchatVendeurPhotoItem,
} from "@/features/commandes-fournisseur/AchatVendeurPhotosDialog";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type LigneDetail = {
  product_name: string;
  qte_achat: number;
  prix_unitaire: number | null;
  uda_label: string | null;
  montant: number;
};

type PhotoItem = AchatVendeurPhotoItem;

type AchatDetail = {
  id: string;
  lot_id: string;
  supplier_id: string;
  supplier_label: string;
  label: string;
  account_type: "vendeur" | "station";
  account_id: string;
  montant_total: number;
  date_cloture: string;
  paye: boolean;
  commentaire: string | null;
};

function accountBackHref(achat: AchatDetail): string {
  if (achat.account_type === "vendeur") {
    return `/commandes-fournisseur/comptes/v/${encodeURIComponent(achat.account_id)}`;
  }
  return `/commandes-fournisseur/comptes/s/${encodeURIComponent(achat.account_id)}`;
}

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function CompteAchatDetailClient() {
  const params = useParams();
  const achatId = String(params.achatId ?? "");
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.comptes.achatDetail");
  const tCommon = useTranslations("common");
  const { formatDate } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();

  const [achat, setAchat] = useState<AchatDetail | null>(null);
  const [lignes, setLignes] = useState<LigneDetail[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !can("commandes_fournisseur.comptes")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/commandes-fournisseur/comptes/achats/${encodeURIComponent(achatId)}`,
      );
      const json = (await res.json()) as {
        achat?: AchatDetail & { commentaire?: string | null };
        lignes?: LigneDetail[];
        photos?: PhotoItem[];
        error?: string;
      };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        setAchat(null);
        setPhotos([]);
        return;
      }
      const a = json.achat ?? null;
      setAchat(
        a
          ? {
              ...a,
              commentaire:
                typeof a.commentaire === "string" && a.commentaire.trim().length > 0
                  ? a.commentaire.trim()
                  : null,
            }
          : null,
      );
      setLignes(json.lignes ?? []);
      setPhotos(
        (json.photos ?? []).flatMap((ph) => {
          if (!ph || typeof ph.id !== "string" || typeof ph.storage_path !== "string") return [];
          return [
            {
              id: ph.id,
              storage_path: ph.storage_path,
              url: typeof ph.url === "string" ? ph.url : null,
              created_at: typeof ph.created_at === "string" ? ph.created_at : "",
            },
          ];
        }),
      );
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [achatId, tCommon]);

  useEffect(() => {
    if (permLoading || !can("commandes_fournisseur.comptes") || !achatId) return;
    void load();
  }, [permLoading, can, achatId, load]);

  async function saveCommentaire(commentaire: string): Promise<void> {
    setMediaBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/commandes-fournisseur/comptes/achats/${encodeURIComponent(achatId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentaire }),
        },
      );
      const json = (await res.json()) as { error?: string; commentaire?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setCommentOpen(false);
      await load();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setMediaBusy(false);
    }
  }

  async function uploadPhoto(file: File): Promise<void> {
    setErr(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(
      `/api/commandes-fournisseur/comptes/achats/${encodeURIComponent(achatId)}/photos`,
      { method: "POST", body: form },
    );
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(typeof json.error === "string" ? json.error : tCommon("error"));
      throw new Error("upload failed");
    }
    await load();
  }

  async function deletePhoto(photoId: string): Promise<void> {
    setErr(null);
    const res = await fetch(
      `/api/commandes-fournisseur/comptes/achats/${encodeURIComponent(achatId)}/photos`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      },
    );
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(typeof json.error === "string" ? json.error : tCommon("error"));
      throw new Error("delete failed");
    }
    await load();
  }

  if (permLoading || !can("commandes_fournisseur.comptes")) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <p className="text-slate-600">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Button
        component={AppLink}
        href={achat ? accountBackHref(achat) : "/commandes-fournisseur/comptes"}
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{ textTransform: "none", mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
      >
        {t("back")}
      </Button>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box className="flex justify-center py-8">
          <CircularProgress size={32} />
        </Box>
      ) : !achat ? (
        <Typography color="text.secondary">{tCommon("error")}</Typography>
      ) : (
        <>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 1 }}>
            {achat.label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {achat.supplier_label} · {formatDate(achat.date_cloture)}
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 3,
              borderColor: achat.paye ? "success.light" : "warning.light",
              bgcolor: achat.paye ? "success.50" : "warning.50",
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {formatDh(achat.montant_total)} DH
            </Typography>
            <Typography variant="body2">
              {achat.paye ? t("paidBadge") : t("unpaidBadge")}
            </Typography>
          </Paper>

          {lignes.length > 0 ? (
            <Table size="small" sx={{ mb: 3 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("product")}</TableCell>
                  <TableCell align="right">{t("qty")}</TableCell>
                  <TableCell>{t("uda")}</TableCell>
                  <TableCell align="right">{t("unitPrice")}</TableCell>
                  <TableCell align="right">{t("amount")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lignes.map((l, i) => (
                  <TableRow key={`${l.product_name}-${i}`}>
                    <TableCell>{l.product_name}</TableCell>
                    <TableCell align="right">{l.qte_achat}</TableCell>
                    <TableCell>{l.uda_label ?? "—"}</TableCell>
                    <TableCell align="right">
                      {l.prix_unitaire != null ? `${formatDh(l.prix_unitaire)} DH` : "—"}
                    </TableCell>
                    <TableCell align="right">{formatDh(l.montant)} DH</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {t("noLines")}
            </Typography>
          )}

          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                mb: 0.75,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t("commentTitle")}
              </Typography>
              <IconButton
                size="small"
                aria-label={t("editCommentAria")}
                disabled={mediaBusy}
                onClick={() => setCommentOpen(true)}
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Box>
            {achat.commentaire ? (
              <Typography
                variant="body2"
                sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {achat.commentaire}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t("noComment")}
              </Typography>
            )}
          </Paper>

          <Box sx={{ mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                mb: 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t("photosTitle")}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<PhotoCameraOutlinedIcon />}
                disabled={mediaBusy}
                onClick={() => setPhotosOpen(true)}
                sx={{ textTransform: "none" }}
              >
                {t("managePhotos")}
              </Button>
            </Box>
            {photos.length > 0 ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                  gap: 1.25,
                }}
              >
                {photos.map((ph) =>
                  ph.url ? (
                    <Box
                      key={ph.id}
                      component="button"
                      type="button"
                      onClick={() => {
                        if (ph.url) setPreviewUrl(ph.url);
                      }}
                      aria-label={t("photosTitle")}
                      sx={{
                        display: "block",
                        p: 0,
                        border: 0,
                        borderRadius: 1,
                        overflow: "hidden",
                        aspectRatio: "1",
                        cursor: "zoom-in",
                        bgcolor: "action.hover",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ph.url}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </Box>
                  ) : null,
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t("noPhotos")}
              </Typography>
            )}
          </Box>

          <Button
            component={AppLink}
            href={`/commandes-fournisseur/achat/lots/${encodeURIComponent(achat.lot_id)}`}
            variant="outlined"
            size="small"
            sx={{ textTransform: "none" }}
          >
            {t("openLot")}
          </Button>
        </>
      )}

      <AchatVendeurCommentDialog
        open={commentOpen}
        vendorLabel={achat?.label ?? ""}
        initialCommentaire={achat?.commentaire ?? ""}
        busy={mediaBusy}
        onClose={() => {
          if (!mediaBusy) setCommentOpen(false);
        }}
        onSave={(commentaire) => void saveCommentaire(commentaire)}
        labels={{
          title: t("commentTitle"),
          field: t("commentTitle"),
          save: tCommon("save"),
          cancel: tCommon("cancel"),
        }}
      />

      <AchatVendeurPhotosDialog
        open={photosOpen}
        vendorLabel={achat?.label ?? ""}
        photos={photos}
        busy={mediaBusy}
        canEdit
        onClose={() => {
          if (!mediaBusy) setPhotosOpen(false);
        }}
        onUpload={uploadPhoto}
        onDelete={deletePhoto}
        labels={{
          title: t("photosTitle"),
          empty: t("noPhotos"),
          camera: t("photoCamera"),
          gallery: t("photoGallery"),
          close: tCommon("close"),
          deleteAria: t("photoDeleteAria"),
        }}
      />

      <Dialog
        open={previewUrl != null}
        onClose={() => setPreviewUrl(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "common.black",
              m: { xs: 1, sm: 2 },
            },
          },
        }}
      >
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 240,
          }}
        >
          <IconButton
            aria-label={tCommon("close")}
            onClick={() => setPreviewUrl(null)}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 1,
              color: "common.white",
              bgcolor: "rgba(0,0,0,0.4)",
              "&:hover": { bgcolor: "rgba(0,0,0,0.6)" },
            }}
          >
            <CloseIcon />
          </IconButton>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : null}
        </Box>
      </Dialog>
    </main>
  );
}
