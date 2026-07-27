import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  isDeviseAchat,
  parseDeviseAchat,
  type DeviseAchat,
} from "@/lib/commandes-fournisseur/achat-devise";

type Ctx = { params: Promise<{ supplierId: string }> };

const VENDEUR_SELECT =
  "id, supplier_id, label, sort_order, created_at, phone, preferred_locale, devise_achat";

function parsePreferredLocale(raw: unknown): "fr" | "ar-MA" {
  return raw === "ar-MA" ? "ar-MA" : "fr";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { supplierId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("ref_supplier_vendeur")
    .select(VENDEUR_SELECT)
    .eq("supplier_id", supplierId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vendeurs: rows ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { supplierId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.achat");
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
  const { data: inserted, error } = await supabase
    .from("ref_supplier_vendeur")
    .insert({
      supplier_id: supplierId,
      label,
      phone: phoneRaw.length > 0 ? phoneRaw : null,
      preferred_locale,
      devise_achat,
    })
    .select(VENDEUR_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(inserted ?? { error: "Création refusée" }, {
    status: inserted ? 201 : 400,
  });
}
