"use client";

import { useCallback, useEffect, useState } from "react";
import AchatVendeurPhotosDialog, {
  type AchatVendeurPhotoItem,
} from "@/features/commandes-fournisseur/AchatVendeurPhotosDialog";

type Props = {
  open: boolean;
  paiementId: string;
  paymentLabel: string;
  onClose: () => void;
  onChanged?: () => void;
  labels: {
    title: string;
    empty: string;
    camera: string;
    gallery: string;
    close: string;
    deleteAria: string;
  };
};

export default function PaiementPhotosDialog({
  open,
  paiementId,
  paymentLabel,
  onClose,
  onChanged,
  labels,
}: Props) {
  const [photos, setPhotos] = useState<AchatVendeurPhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const apiBase = `/api/commandes-fournisseur/comptes/paiements/${encodeURIComponent(paiementId)}/photos`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiBase);
      const json = (await res.json()) as { photos?: AchatVendeurPhotoItem[] };
      setPhotos(json.photos ?? []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!open || !paiementId) return;
    void load();
  }, [open, paiementId, load]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiBase, { method: "POST", body: form });
      if (!res.ok) return;
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function remove(photoId: string) {
    setBusy(true);
    try {
      const res = await fetch(apiBase, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      if (!res.ok) return;
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AchatVendeurPhotosDialog
      open={open}
      vendorLabel={paymentLabel}
      photos={photos}
      busy={loading || busy}
      canEdit
      onClose={onClose}
      onUpload={upload}
      onDelete={remove}
      labels={labels}
    />
  );
}
