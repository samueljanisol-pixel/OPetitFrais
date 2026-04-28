"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField, Typography, List, ListItem, Divider, IconButton } from "@mui/material";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import AppLink from "@/components/AppLink";

type Ligne = {
  id: string;
  product_id: string;
  product_packaging_id: string | null;
  qte: number;
  line_comment: string | null;
  hors_fournisseur: boolean;
  product: { name: string; code: string } | null;
  /** Unité de vente du produit (réf. produit) : à l’unité et « Soit » pour conditionnements. */
  uniteVente?: string;
  condTitre?: string | null;
  /** Quantité contenu par conditionnement (product_packaging.quantity), pour le calcul Soit. */
  packContentQty?: number | null;
};

type Commande = {
  id: string;
  status: string;
  commentaire: string | null;
  supplier_id: string;
  ref_supplier: { label: string } | { label: string }[] | null;
};

function supplierLabel(c: Commande): string {
  const r = c.ref_supplier;
  if (!r) return "—";
  const x = Array.isArray(r) ? r[0] : r;
  return (x as { label?: string })?.label ?? "—";
}

function formatSoit(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

function StepQte({
  value,
  uniteVente,
  onChange,
  hideUnit,
}: {
  value: number;
  uniteVente: string;
  onChange: (n: number) => void;
  /** Conditionnement : pas d’unité de vente à droite de la quantité. */
  hideUnit?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button size="small" variant="outlined" onClick={() => onChange(Math.max(0, value - 1))} disabled={value < 1}>
        -1
      </Button>
      <div className="flex min-w-0 items-baseline justify-center gap-1">
        <Typography className="shrink-0 min-w-[1.5rem] text-center font-medium">{value}</Typography>
        {hideUnit ? null : (
          <Typography variant="caption" color="text.secondary" className="shrink-0">
            {uniteVente}
          </Typography>
        )}
      </div>
      <Button size="small" variant="outlined" onClick={() => onChange(value + 1)}>
        +1
      </Button>
    </div>
  );
}

export default function RecapClient({ commandeId }: { commandeId: string }) {
  const router = useRouter();
  const [commande, setCommande] = useState<Commande | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, { credentials: "include" });
      const j = (await res.json()) as { commande?: Commande; lignes?: Ligne[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erreur");
        return;
      }
      if (j.commande) {
        setCommande(j.commande);
        setComment(j.commande.commentaire ?? "");
      }
      setLignes(j.lignes ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [commandeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = commande?.status === "en_saisie";

  const putLignes = useCallback(
    async (list: Ligne[]) => {
      const payload = list.map((l) => ({
        productId: l.product_id,
        productPackagingId: l.product_packaging_id,
        qte: l.qte,
        lineComment: l.line_comment,
        horsFournisseur: l.hors_fournisseur,
      }));
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}/lignes`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lignes: payload }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? "Sauvegarde lignes");
      }
    },
    [commandeId],
  );

  const persistLignes = useCallback(async () => {
    await putLignes(lignes);
  }, [lignes, putLignes]);

  const saveComment = useCallback(async () => {
    const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentaire: comment }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(j.error ?? "Commentaire");
    }
  }, [commandeId, comment]);

  const onValidate = useCallback(async () => {
    setErr(null);
    setSaving(true);
    try {
      if (editable) {
        await persistLignes();
        await saveComment();
      }
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "validee" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? "Validation");
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [commandeId, editable, load, persistLignes, router, saveComment]);

  const onRouvrir = useCallback(async () => {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/commandes-fournisseur/commandes/${commandeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "en_saisie" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? "Réouverture");
      }
      void router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [commandeId, load, router]);

  const setLigneQte = (i: number, q: number) => {
    setLignes((prev) => {
      const next = [...prev];
      const row = next[i];
      if (!row) return prev;
      next[i] = { ...row, qte: q };
      return next;
    });
  };

  const onDeleteLigne = useCallback(
    async (i: number) => {
      if (!editable) return;
      setErr(null);
      setSaving(true);
      try {
        const next = lignes.filter((_, j) => j !== i);
        await putLignes(next);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
      } finally {
        setSaving(false);
      }
    },
    [editable, lignes, load, putLignes],
  );

  if (loading) {
    return <p className="px-4 py-4">Chargement…</p>;
  }

  if (err && !commande) {
    return (
      <main className="px-4 py-4">
        <Typography color="error">{err}</Typography>
      </main>
    );
  }

  if (!commande) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }}>
        Récapitulatif
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-4">
        {supplierLabel(commande)} — {commande.status}
      </Typography>

      {err ? (
        <Typography color="error" className="!mb-2" variant="body2">
          {err}
        </Typography>
      ) : null}

      <TextField
        fullWidth
        multiline
        minRows={2}
        label="Commentaire commande"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => {
          if (editable) void saveComment().catch(() => undefined);
        }}
        disabled={!editable}
        size="small"
        className="!mb-4"
      />

      <Typography variant="subtitle2" className="!mb-2">
        Lignes
      </Typography>
      <List dense disablePadding>
        {lignes.map((l, i) => {
          const u = l.uniteVente ?? "—";
          const isCond = Boolean(l.product_packaging_id);
          const pq = l.packContentQty;
          const soitCond =
            isCond && pq != null && Number.isFinite(pq) && l.qte > 0
              ? `Soit ${formatSoit(l.qte * pq)} ${u}`
              : null;
          return (
            <ListItem key={l.id} disableGutters className="!flex-col !items-stretch !mb-2">
              <div className="flex w-full items-start justify-between gap-2">
                <div className="min-w-0 flex-1 pr-1">
                  <Typography variant="body2" className="!font-medium">
                    {l.product?.name ?? l.product_id}
                  </Typography>
                  {l.condTitre ? (
                    <Typography variant="caption" color="text.secondary" className="!mt-0.5 block">
                      {l.condTitre}
                    </Typography>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  {editable ? (
                    <>
                      <div className="flex items-center gap-0.5">
                        <StepQte
                          value={l.qte}
                          uniteVente={u}
                          hideUnit={isCond}
                          onChange={(q) => setLigneQte(i, q)}
                        />
                        <IconButton
                          type="button"
                          size="small"
                          color="error"
                          aria-label="Supprimer la ligne"
                          onClick={() => void onDeleteLigne(i)}
                          disabled={saving}
                        >
                          <DeleteOutlineOutlinedIcon fontSize="small" />
                        </IconButton>
                      </div>
                      {isCond && soitCond ? (
                        <Typography variant="body2" color="text.secondary" className="!pr-7">
                          {soitCond}
                        </Typography>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex flex-col items-end pr-0.5">
                      <div className="flex items-baseline gap-1">
                        <Typography variant="body2" className="font-medium">
                          {l.qte}
                        </Typography>
                        {isCond ? null : (
                          <Typography variant="body2" color="text.secondary">
                            {u}
                          </Typography>
                        )}
                      </div>
                      {isCond && soitCond ? (
                        <Typography variant="body2" color="text.secondary">
                          {soitCond}
                        </Typography>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
              <Divider className="!my-2" />
            </ListItem>
          );
        })}
      </List>

      {lignes.length === 0 ? (
        <Typography variant="body2" color="text.secondary" className="!mb-4">
          Aucune ligne. Passez par le parcours produits.
        </Typography>
      ) : null}

      <div className="!mt-4 flex flex-col gap-2">
        {editable ? (
          <>
            <Button
              component={AppLink}
              href={`/commandes-fournisseur/saisie/${commandeId}/parcours`}
              variant="outlined"
              fullWidth
              sx={{ textTransform: "none" }}
            >
              Parcours produits
            </Button>
            <Button variant="contained" color="success" fullWidth onClick={() => void onValidate()} disabled={saving} sx={{ textTransform: "none" }}>
              {saving ? "…" : "Valider la commande"}
            </Button>
          </>
        ) : null}

        {commande.status === "validee" ? (
          <Button variant="outlined" color="warning" fullWidth onClick={() => void onRouvrir()} disabled={saving} sx={{ textTransform: "none" }}>
            {saving ? "…" : "Modifier (retour en saisie)"}
          </Button>
        ) : null}

        {commande.status === "integree" ? (
          <Typography variant="body2" color="text.secondary">
            Cette commande a été prise en compte par le gestionnaire. Modification impossible.
          </Typography>
        ) : null}

        <Button component={AppLink} href="/commandes-fournisseur/saisie" color="inherit" fullWidth sx={{ textTransform: "none" }}>
          Liste des commandes
        </Button>
      </div>
    </main>
  );
}
