import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { ACTUALISATION_PERMS } from "@/lib/products/actualisation";

export async function GET() {
  const gate = await requireAnyApiPermission([...ACTUALISATION_PERMS]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();

  const [prixRes, actRes, desactRes] = await Promise.all([
    supabase.from("product_actualisation_prix").select("product_id", { count: "exact", head: true }),
    supabase
      .from("product_actualisation_activation")
      .select("product_id", { count: "exact", head: true }),
    supabase
      .from("product_actualisation_desactivation")
      .select("product_id", { count: "exact", head: true }),
  ]);

  if (prixRes.error) {
    return NextResponse.json({ error: prixRes.error.message }, { status: 500 });
  }
  if (actRes.error) {
    return NextResponse.json({ error: actRes.error.message }, { status: 500 });
  }
  if (desactRes.error) {
    return NextResponse.json({ error: desactRes.error.message }, { status: 500 });
  }

  const prix = prixRes.count ?? 0;
  const activation = actRes.count ?? 0;
  const desactivation = desactRes.count ?? 0;

  return NextResponse.json({
    prix,
    activation,
    desactivation,
    total: prix + activation + desactivation,
  });
}
