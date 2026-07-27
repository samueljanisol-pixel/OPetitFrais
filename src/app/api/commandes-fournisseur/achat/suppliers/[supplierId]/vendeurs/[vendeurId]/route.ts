import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  isDeviseAchat,
  parseDeviseAchat,
  type DeviseAchat,
} from "@/lib/commandes-fournisseur/achat-devise";

type Ctx = { params: Promise<{ supplierId: string; vendeurId: string }> };

const VENDEUR_SELECT =
  "id, supplier_id, label, sort_order, created_at, phone, preferred_locale, devise_achat";

function parsePreferredLocale(raw: unknown): "fr" | "ar-MA" {
  return raw === "ar-MA" ? "ar-MA" : "fr";
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { supplierId, vendeurId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.vendeurs_renommer");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const label = typeof obj.label === "string" ? obj.label.trim() : "";
  if (label.length === 0) {
    return NextResponse.json({ error: "label requis" }, { status: 400 });
  }

  const phoneRaw = typeof obj.phone === "string" ? obj.phone.trim() : "";
  const preferred_locale = parsePreferredLocale(obj.preferred_locale);
  const devise_achat: DeviseAchat = isDeviseAchat(obj.devise_achat)
    ? obj.devise_achat
    : parseDeviseAchat(obj.devise_achat);

  const supabase = await createSupabaseServerClient();

  const { data: updated, error } = await supabase
    .from("ref_supplier_vendeur")
    .update({
      label,
      phone: phoneRaw.length > 0 ? phoneRaw : null,
      preferred_locale,
      devise_achat,
    })
    .eq("id", vendeurId)
    .eq("supplier_id", supplierId)
    .select(VENDEUR_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "Vendeur introuvable ou autre fournisseur" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
