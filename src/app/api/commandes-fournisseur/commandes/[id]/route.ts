import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import { userHasMagasin } from "@/lib/commandes-fournisseur/api-helpers";

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
      "id, magasin_id, supplier_id, status, commentaire, lot_id, validated_at, created_at, updated_at, ref_supplier(id, code, label), magasins(id, code, nom)",
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

  type LabelRow = { label: string | null };
  function labelFromRef(raw: unknown): string {
    const o = (Array.isArray(raw) ? raw[0] : raw) as LabelRow | null | undefined;
    const t = o?.label?.trim();
    return t ? String(t) : "—";
  }

  function formatPackQty(n: number): string {
    if (!Number.isFinite(n)) return "0";
    if (Number.isInteger(n)) return String(n);
    return n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
  }

  type ProductRow = {
    id: string;
    name: string;
    code: string;
    ref_sales_unit: unknown;
    ref_category?: unknown;
  };
  let productMap: Record<string, ProductRow> = {};
  if (pids.length > 0) {
    const { data: prods } = await supabase
      .from("product")
      .select("id, name, code, ref_sales_unit(label), ref_category(label, sort_order)")
      .in("id", pids);
    productMap = Object.fromEntries((prods ?? []).map((p) => [p.id, p as ProductRow]));
  }

  type CatSort = { label: string; sort_order: number | null };
  function parseCategory(raw: unknown): CatSort {
    const c = (Array.isArray(raw) ? raw[0] : raw) as { label?: string; sort_order?: number | null } | null | undefined;
    if (!c || typeof c !== "object") {
      return { label: "", sort_order: null };
    }
    const lb = typeof c.label === "string" ? c.label.trim() : "";
    return { label: lb, sort_order: c.sort_order ?? null };
  }

  function lignesOrderedByCategory(
    ligneRows: typeof rawLignes,
    prods: Record<string, ProductRow>,
  ): typeof ligneRows {
    const out = [...ligneRows];
    out.sort((a, b) => {
      const pa = prods[a.product_id as string];
      const pb = prods[b.product_id as string];
      const ca = pa ? parseCategory(pa.ref_category) : { label: "", sort_order: null };
      const cb = pb ? parseCategory(pb.ref_category) : { label: "", sort_order: null };
      const oa = ca.sort_order ?? 0;
      const ob = cb.sort_order ?? 0;
      if (oa !== ob) return oa - ob;
      const lc = ca.label.localeCompare(cb.label, "fr");
      if (lc !== 0) return lc;
      const na = (pa?.name ?? "").localeCompare(pb?.name ?? "", "fr");
      if (na !== 0) return na;
      return String(a.id).localeCompare(String(b.id));
    });
    return out;
  }

  type PackRow = {
    id: string;
    quantity: string | number;
    ref_sales_unit: unknown;
    ref_conditionnement: unknown;
  };
  let packMap: Record<string, PackRow> = {};
  if (packIds.length > 0) {
    const { data: packs } = await supabase
      .from("product_packaging")
      .select("id, quantity, ref_sales_unit(label), ref_conditionnement(label)")
      .in("id", packIds);
    packMap = Object.fromEntries((packs ?? []).map((pk) => [pk.id, pk as PackRow]));
  }

  const lignesSorted = lignesOrderedByCategory(rawLignes, productMap);

  return NextResponse.json({
    commande: cmd,
    lignes: lignesSorted.map((l) => {
      const product = productMap[l.product_id as string] ?? null;
      const packId = l.product_packaging_id as string | null;
      const uniteVente = product ? labelFromRef(product.ref_sales_unit) : "—";
      const pr = packId ? packMap[packId] : null;
      const packQty = pr ? (typeof pr.quantity === "string" ? parseFloat(pr.quantity) : Number(pr.quantity)) : 0;
      const condN = pr ? labelFromRef(pr.ref_conditionnement) : "—";
      const packUs = pr ? labelFromRef(pr.ref_sales_unit) : "—";
      const condTitre =
        pr && pr.id
          ? `${condN !== "—" ? condN : "Colis"} (${formatPackQty(packQty)} ${packUs})`
          : null;
      const cat = product ? parseCategory(product.ref_category) : { label: "", sort_order: null };
      const categoryLabel = cat.label.length > 0 ? cat.label : "Sans catégorie";
      return {
        ...l,
        product: product ? { id: product.id, name: product.name, code: product.code } : null,
        uniteVente,
        condTitre,
        packContentQty: pr && pr.id && Number.isFinite(packQty) ? packQty : null,
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
