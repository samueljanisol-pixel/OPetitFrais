import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { EMBALLAGE_SELECT, parseEmballageRow } from "@/lib/emballages/emballage-api";
import {
  deactivateProductMirrorById,
  upsertProductMirrorFromEmballage,
} from "@/lib/emballages/sync-product-mirror";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: rawId } = await ctx.params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  let body: {
    label?: string;
    categorie_id?: string;
    reference?: string | null;
    type_id?: string | null;
    sort_order?: number | string;
    active?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
      return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
    }
    patch.label = label;
  }
  if ("categorie_id" in body) {
    const categorie_id = typeof body.categorie_id === "string" ? body.categorie_id.trim() : "";
    if (!categorie_id) {
      return NextResponse.json({ error: "Catégorie requise" }, { status: 400 });
    }
    patch.categorie_id = categorie_id;
  }
  if ("reference" in body) {
    patch.reference =
      body.reference == null || body.reference === ""
        ? null
        : typeof body.reference === "string"
          ? body.reference.trim() || null
          : null;
  }
  if ("type_id" in body) {
    patch.type_id =
      typeof body.type_id === "string" && body.type_id.trim() ? body.type_id.trim() : null;
  }
  if ("sort_order" in body) {
    patch.sort_order =
      typeof body.sort_order === "number"
        ? body.sort_order
        : Number.parseInt(String(body.sort_order ?? "0"), 10) || 0;
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Champ active invalide" }, { status: 400 });
    }
    patch.active = body.active;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data, error } = await service
    .from("ref_emballage")
    .update(patch)
    .eq("id", id)
    .select(EMBALLAGE_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Article introuvable" }, { status: 404 });
  }

  const mirror = await upsertProductMirrorFromEmballage(service, id);
  if (mirror.error) {
    return NextResponse.json({ error: mirror.error }, { status: 500 });
  }

  return NextResponse.json({ emballage: parseEmballageRow(data as Record<string, unknown>) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: rawId } = await ctx.params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { count, error: ce } = await service
    .from("emballage_achat_ligne")
    .select("id", { count: "exact", head: true })
    .eq("emballage_id", id);
  if (ce) {
    return NextResponse.json({ error: ce.message }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Article utilisé sur des achats — suppression impossible" },
      { status: 409 },
    );
  }

  const { count: productEmbCount, error: pe } = await service
    .from("product")
    .select("id", { count: "exact", head: true })
    .or(`emballage_id.eq.${id},etiquette_id.eq.${id}`);
  if (pe) {
    return NextResponse.json({ error: pe.message }, { status: 500 });
  }
  if ((productEmbCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Article utilisé sur des produits — suppression impossible" },
      { status: 409 },
    );
  }

  const { data: embRow, error: embErr } = await service
    .from("ref_emballage")
    .select("product_id")
    .eq("id", id)
    .maybeSingle();
  if (embErr) {
    return NextResponse.json({ error: embErr.message }, { status: 500 });
  }

  const mirrorProductId = (embRow as { product_id?: string | null } | null)?.product_id;
  if (mirrorProductId) {
    const { count: cmdCount, error: cmdErr } = await service
      .from("commande_fournisseur_ligne")
      .select("id", { count: "exact", head: true })
      .eq("product_id", mirrorProductId);
    if (cmdErr) {
      return NextResponse.json({ error: cmdErr.message }, { status: 500 });
    }
    if ((cmdCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "Article commandé — suppression impossible" },
        { status: 409 },
      );
    }

    const { count: lotCount, error: lotErr } = await service
      .from("commande_fournisseur_lot_ligne")
      .select("id", { count: "exact", head: true })
      .eq("product_id", mirrorProductId);
    if (lotErr) {
      return NextResponse.json({ error: lotErr.message }, { status: 500 });
    }
    if ((lotCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "Article présent sur des lots — suppression impossible" },
        { status: 409 },
      );
    }
  }

  const { error } = await service.from("ref_emballage").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (mirrorProductId) {
    const deactivated = await deactivateProductMirrorById(service, mirrorProductId);
    if (!deactivated.ok) {
      return NextResponse.json({ error: deactivated.error }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
