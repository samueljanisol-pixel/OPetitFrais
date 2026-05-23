import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { profileRowDisplayLabel } from "@/lib/auth/display-label";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import { userHasMagasin } from "@/lib/commandes-fournisseur/api-helpers";
import {
  categoryDisplayLabel,
  compareByCategoryThenProductName,
  parseCategoryFromRef,
} from "@/lib/commandes-fournisseur/ligne-category-order";
import {
  buildPackagingCondTitre,
  isPackSalesUnitUnite,
  labelFromRef,
} from "@/lib/commandes-fournisseur/product-display";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireAnyApiPermission([
    "commandes_fournisseur.saisie",
    "commandes_fournisseur.consolidation",
  ]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: cmd, error } = await supabase
    .from("commande_fournisseur")
    .select(
      "id, magasin_id, supplier_id, status, commentaire, lot_id, created_by, validated_at, cancelled_at, cancelled_by, created_at, updated_at, ref_supplier(id, code, label), magasins(id, code, nom)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!cmd) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  if (gate.userId) {
    const { data: keysRaw } = await supabase.rpc("get_my_permission_keys");
    const keys = new Set((keysRaw as string[]) ?? []);
    if (keys.has("commandes_fournisseur.saisie") && !keys.has("commandes_fournisseur.consolidation")) {
      const ok = await userHasMagasin(supabase, gate.userId, cmd.magasin_id as string);
      if (!ok) {
        return NextResponse.json({ error: "Interdit" }, { status: 403 });
      }
    }
  }

  const { data: lignes, error: le } = await supabase
    .from("commande_fournisseur_ligne")
    .select("id, product_id, product_packaging_id, qte, line_comment, hors_fournisseur, created_at")
    .eq("commande_id", id)
    .order("created_at", { ascending: true });

  if (le) {
    return NextResponse.json({ error: le.message }, { status: 500 });
  }

  const rawLignes = lignes ?? [];
  const pids = [...new Set(rawLignes.map((l) => l.product_id).filter(Boolean))] as string[];
  const packIds = [
    ...new Set(
      rawLignes.map((l) => l.product_packaging_id).filter((x): x is string => Boolean(x)),
    ),
  ];

  type ProductRow = {
    id: string;
    name: string;
    name_ar: string | null;
    code: string;
    vendeur_id: string | null;
    ref_sales_unit: unknown;
    ref_category?: unknown;
  };
  let productMap: Record<string, ProductRow> = {};
  if (pids.length > 0) {
    const { data: prods } = await supabase
      .from("product")
      .select("id, name, name_ar, code, vendeur_id, ref_sales_unit(label), ref_category(label, sort_order)")
      .in("id", pids);
    productMap = Object.fromEntries((prods ?? []).map((p) => [p.id, p as ProductRow]));
  }

  function lignesOrderedByCategory(
    ligneRows: typeof rawLignes,
    prods: Record<string, ProductRow>,
  ): typeof ligneRows {
    const out = [...ligneRows];
    out.sort((a, b) => {
      const pa = prods[a.product_id as string];
      const pb = prods[b.product_id as string];
      const ca = pa ? parseCategoryFromRef(pa.ref_category) : { label: "", sort_order: null };
      const cb = pb ? parseCategoryFromRef(pb.ref_category) : { label: "", sort_order: null };
      return compareByCategoryThenProductName(
        ca,
        cb,
        pa?.name ?? "",
        pb?.name ?? "",
        String(a.id),
        String(b.id),
      );
    });
    return out;
  }

  type PackRow = {
    id: string;
    quantity: string | number;
    nom?: string | null;
    ref_sales_unit: unknown;
    ref_conditionnement: unknown;
  };
  let packMap: Record<string, PackRow> = {};
  if (packIds.length > 0) {
    const { data: packs } = await supabase
      .from("product_packaging")
      .select("id, quantity, nom, ref_sales_unit(label, code), ref_conditionnement(label)")
      .in("id", packIds);
    packMap = Object.fromEntries((packs ?? []).map((pk) => [pk.id, pk as PackRow]));
  }

  const lignesSorted = lignesOrderedByCategory(rawLignes, productMap);

  const { data: vendeurs, error: ve } = await supabase
    .from("ref_supplier_vendeur")
    .select("id, label")
    .eq("supplier_id", cmd.supplier_id as string)
    .order("sort_order")
    .order("label");

  if (ve) {
    return NextResponse.json({ error: ve.message }, { status: 500 });
  }

  let saisieParLabel: string | null = null;
  const createdBy = cmd.created_by as string | null | undefined;
  if (typeof createdBy === "string" && createdBy.length > 0) {
    try {
      const service = createSupabaseServiceRoleClient();
      const { data: creator } = await service
        .from("profiles")
        .select("login, prenom, nom")
        .eq("user_id", createdBy)
        .maybeSingle();
      saisieParLabel = profileRowDisplayLabel(creator, createdBy);
    } catch {
      saisieParLabel = null;
    }
  }

  return NextResponse.json({
    commande: cmd,
    saisieParLabel,
    vendeurs: (vendeurs ?? []).map((v) => ({
      id: v.id as string,
      label: (v as { label: string }).label,
    })),
    lignes: lignesSorted.map((l) => {
      const product = productMap[l.product_id as string] ?? null;
      const packId = l.product_packaging_id as string | null;
      const uniteVente = product ? labelFromRef(product.ref_sales_unit) : "—";
      const pr = packId ? packMap[packId] : null;
      const packQty = pr ? (typeof pr.quantity === "string" ? parseFloat(pr.quantity) : Number(pr.quantity)) : 0;
      const condTitre = pr && pr.id ? buildPackagingCondTitre(pr) : null;
      const condPackUniteVente = pr ? labelFromRef(pr.ref_sales_unit) : null;
      const cat = product ? parseCategoryFromRef(product.ref_category) : { label: "", sort_order: null };
      const categoryLabel = categoryDisplayLabel(cat);
      return {
        ...l,
        vendeur_id: product?.vendeur_id ?? null,
        product: product
          ? { id: product.id, name: product.name, code: product.code, name_ar: product.name_ar }
          : null,
        uniteVente,
        condPackUniteVente: condPackUniteVente && condPackUniteVente !== "—" ? condPackUniteVente : null,
        condTitre,
        packContentQty: pr && pr.id && Number.isFinite(packQty) ? packQty : null,
        packSalesUnitIsUnite: pr ? isPackSalesUnitUnite(pr.ref_sales_unit) : false,
        categoryLabel,
      };
    }),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireAnyApiPermission([
    "commandes_fournisseur.saisie",
    "commandes_fournisseur.consolidation",
  ]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { status?: string; commentaire?: string | null };
  try {
    body = (await req.json()) as { status?: string; commentaire?: string | null };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: current, error: re } = await supabase
    .from("commande_fournisseur")
    .select("id, magasin_id, status")
    .eq("id", id)
    .maybeSingle();

  if (re || !current) {
    return NextResponse.json({ error: re?.message ?? "Introuvable" }, { status: re ? 500 : 404 });
  }

  if (current.status === "annulee") {
    return NextResponse.json({ error: "Commande annulée" }, { status: 409 });
  }

  const { data: keysRaw } = await supabase.rpc("get_my_permission_keys");
  const keys = new Set((keysRaw as string[]) ?? []);
  const isSaisie = keys.has("commandes_fournisseur.saisie");
  const isConsolid = keys.has("commandes_fournisseur.consolidation");

  if (isSaisie && !isConsolid) {
    const okM = await userHasMagasin(supabase, gate.userId, current.magasin_id as string);
    if (!okM) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    if (current.status === "integree") {
      return NextResponse.json({ error: "Commande verrouillée" }, { status: 409 });
    }
    if (body.status === "integree") {
      return NextResponse.json({ error: "Réservé à la consolidation" }, { status: 403 });
    }
  }

  const payload: Record<string, unknown> = {};
  if (body.commentaire !== undefined) {
    payload.commentaire = body.commentaire;
  }
  if (body.status !== undefined) {
    if (body.status === "annulee") {
      return NextResponse.json(
        { error: "Utilisez POST /api/commandes-fournisseur/commandes/:id/cancel pour annuler" },
        { status: 400 },
      );
    }
    if (["en_saisie", "validee", "integree"].includes(body.status)) {
      payload.status = body.status;
      if (body.status === "validee") {
        payload.validated_at = new Date().toISOString();
      }
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const { error } = await supabase.from("commande_fournisseur").update(payload).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.saisie");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: current, error: re } = await supabase
    .from("commande_fournisseur")
    .select("id, magasin_id, status")
    .eq("id", id)
    .maybeSingle();

  if (re || !current) {
    return NextResponse.json({ error: re?.message ?? "Introuvable" }, { status: re ? 500 : 404 });
  }

  const okM = await userHasMagasin(supabase, gate.userId, current.magasin_id as string);
  if (!okM) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }
  if (current.status !== "en_saisie") {
    return NextResponse.json({ error: "Suppression réservée au brouillon" }, { status: 409 });
  }

  const { error } = await supabase.from("commande_fournisseur").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
