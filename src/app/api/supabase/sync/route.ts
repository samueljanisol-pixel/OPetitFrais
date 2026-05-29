import { NextResponse } from "next/server";
import { syncDateToSupabase } from "@/lib/sync/ftpToSupabase";

// Endpoint de sync "à la demande" (protégé par un token simple).
// Usage: POST /api/supabase/sync?token=...&date=YYYY-MM-DD
// - Remplit/MAJ:
//   - ca_day(date, magasin, total, nb_paniers)
//   - ca_month(ym, magasin, total, nb_paniers)  (à partir de ventes_YYYY-MM.json)
//   - ca_product_day(date, magasin, article, qty, total)
//   - ca_panier_hour(date, magasin, hour, nb) depuis panier_heure des JSON jour

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = process.env.SYNC_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = url.searchParams.get("date") ?? new Date().toISOString().split("T")[0];
  try {
    const result = await syncDateToSupabase(date);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 },
    );
  }
}

