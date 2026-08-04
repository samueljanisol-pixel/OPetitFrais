import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  loadAchatsForAccount,
  loadPaiementsForAccount,
  summarizeAchats,
} from "@/lib/commandes-fournisseur/compte-queries";

type Ctx = { params: Promise<{ supplierId: string }> };

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { supplierId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();

  const { data: supplier, error: se } = await supabase
    .from("ref_supplier")
    .select("id, code, label")
    .eq("id", supplierId)
    .maybeSingle();

  if (se) {
    return NextResponse.json({ error: se.message }, { status: 500 });
  }
  if (!supplier) {
    return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 404 });
  }

  const { count: vendeurCount, error: vce } = await supabase
    .from("ref_supplier_vendeur")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId);

  if (vce) {
    return NextResponse.json({ error: vce.message }, { status: 500 });
  }
  if ((vendeurCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Ce fournisseur a des vendeurs : ouvrez un compte vendeur" },
      { status: 409 },
    );
  }

  const account = { type: "station" as const, supplierId };
  const [achatsRes, paiementsRes] = await Promise.all([
    loadAchatsForAccount(supabase, account),
    loadPaiementsForAccount(supabase, account),
  ]);

  if ("error" in achatsRes) {
    return NextResponse.json({ error: achatsRes.error }, { status: 500 });
  }
  if ("error" in paiementsRes) {
    return NextResponse.json({ error: paiementsRes.error }, { status: 500 });
  }

  const supObj = one(supplier);
  const label =
    (typeof supObj?.label === "string" && supObj.label.trim()) ||
    (typeof supObj?.code === "string" && supObj.code.trim()) ||
    "—";

  const achats = achatsRes.achats.map((a) => ({ ...a, label }));

  const totals = summarizeAchats(achatsRes.achats);

  return NextResponse.json({
    account: {
      account_type: "station" as const,
      account_id: supplierId,
      label,
      supplier_id: supplierId,
      whatsapp_phone: null,
      whatsapp_available: false,
    },
    achats,
    paiements: paiementsRes.paiements,
    totals,
  });
}
