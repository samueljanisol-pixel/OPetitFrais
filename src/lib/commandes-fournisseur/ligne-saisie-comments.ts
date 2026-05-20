import type { SupabaseClient } from "@supabase/supabase-js";

export type SaisieCommentEntry = {
  magasinLabel: string;
  comment: string;
};

export type SaisieLigneTarget = {
  ligneId: string;
  commandeId: string;
  magasinId: string;
  magasinLabel: string;
  lineComment: string | null;
};

export type CommentaireMagasinCell = {
  ligneId: string;
  commandeId: string;
  lineComment: string | null;
};

function magasinLabelFromNested(raw: unknown): string {
  const cf = raw as
    | { magasins?: { nom?: string | null; code?: string | null } | { nom?: string | null; code?: string | null }[] | null }
    | { magasins?: { nom?: string | null; code?: string | null } | { nom?: string | null; code?: string | null }[] | null }[]
    | null
    | undefined;
  const oneCf = Array.isArray(cf) ? cf[0] : cf;
  const mag = oneCf?.magasins;
  const m = Array.isArray(mag) ? mag[0] : mag;
  const nom = typeof m?.nom === "string" ? m.nom.trim() : "";
  if (nom.length > 0) {
    return nom;
  }
  const code = typeof m?.code === "string" ? m.code.trim() : "";
  return code.length > 0 ? code : "Magasin";
}

function magasinIdFromNested(raw: unknown): string | null {
  const cf = raw as
    | { magasin_id?: string }
    | { magasin_id?: string }[]
    | null
    | undefined;
  const oneCf = Array.isArray(cf) ? cf[0] : cf;
  const mid = oneCf?.magasin_id;
  return typeof mid === "string" && mid.length > 0 ? mid : null;
}

export function commentairesMagasinFromTargets(
  targets: SaisieLigneTarget[],
): Record<string, CommentaireMagasinCell> {
  const out: Record<string, CommentaireMagasinCell> = {};
  for (const t of targets) {
    out[t.magasinId] = {
      ligneId: t.ligneId,
      commandeId: t.commandeId,
      lineComment: t.lineComment,
    };
  }
  return out;
}

export function saisieCommentsFromTargets(targets: SaisieLigneTarget[]): SaisieCommentEntry[] {
  const out: SaisieCommentEntry[] = [];
  for (const t of targets) {
    const comment = t.lineComment?.trim();
    if (!comment) {
      continue;
    }
    out.push({ magasinLabel: t.magasinLabel, comment });
  }
  return out;
}

/** Lignes commande du lot (par produit) pour afficher / éditer les commentaires saisie. */
export async function saisieLigneTargetsByProductForLot(
  supabase: SupabaseClient,
  lotId: string,
): Promise<Map<string, SaisieLigneTarget[]>> {
  const out = new Map<string, SaisieLigneTarget[]>();

  const { data: incs, error: ie } = await supabase
    .from("commande_fournisseur_lot_inclusion")
    .select("commande_id")
    .eq("lot_id", lotId);
  if (ie) {
    return out;
  }
  const commandeIds = [
    ...new Set(
      (incs ?? [])
        .map((r) => (r as { commande_id?: string }).commande_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (commandeIds.length === 0) {
    return out;
  }

  const { data: lotLignes, error: leLot } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("product_id")
    .eq("lot_id", lotId);
  if (leLot) {
    return out;
  }
  const productIds = [
    ...new Set(
      (lotLignes ?? [])
        .map((r) => (r as { product_id?: string }).product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (productIds.length === 0) {
    return out;
  }

  const { data: lignes, error: le } = await supabase
    .from("commande_fournisseur_ligne")
    .select(
      "id, commande_id, product_id, line_comment, commande_fournisseur(magasin_id, magasins(nom, code))",
    )
    .in("commande_id", commandeIds)
    .in("product_id", productIds);
  if (le || !lignes) {
    return out;
  }

  for (const row of lignes) {
    const pid = (row as { product_id?: string }).product_id;
    const ligneId = (row as { id?: string }).id;
    const commandeId = (row as { commande_id?: string }).commande_id;
    if (!pid || !ligneId || !commandeId) {
      continue;
    }
    const cf = (row as { commande_fournisseur?: unknown }).commande_fournisseur;
    const magasinId = magasinIdFromNested(cf);
    if (!magasinId) {
      continue;
    }
    const rawComment = (row as { line_comment?: string | null }).line_comment;
    const lineComment =
      typeof rawComment === "string" && rawComment.trim().length > 0 ? rawComment.trim() : null;
    const target: SaisieLigneTarget = {
      ligneId,
      commandeId,
      magasinId,
      magasinLabel: magasinLabelFromNested(cf),
      lineComment,
    };
    const list = out.get(pid) ?? [];
    list.push(target);
    out.set(pid, list);
  }

  return out;
}

/** Commentaires saisie (commande_fournisseur_ligne) regroupés par product_id pour un lot. */
export async function saisieCommentsByProductForLot(
  supabase: SupabaseClient,
  lotId: string,
): Promise<Map<string, SaisieCommentEntry[]>> {
  const targetsMap = await saisieLigneTargetsByProductForLot(supabase, lotId);
  const out = new Map<string, SaisieCommentEntry[]>();
  for (const [pid, targets] of targetsMap) {
    const comments = saisieCommentsFromTargets(targets);
    if (comments.length > 0) {
      out.set(pid, comments);
    }
  }
  return out;
}
