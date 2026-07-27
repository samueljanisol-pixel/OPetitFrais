import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { loadAchatLotReportPayload } from "@/lib/commandes-fournisseur/achat-lot-report-data";
import {
  achatLotReportPdfFilename,
  buildAchatLotReportPdf,
} from "@/lib/commandes-fournisseur/achat-lot-report-pdf";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Rapport PDF A4 du lot d'achat (produits par vendeur, frais, totaux).
 * Permission : `commandes_fournisseur.achat`.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const loaded = await loadAchatLotReportPayload(supabase, id);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  try {
    const pdf = await buildAchatLotReportPdf(loaded.payload);
    const filename = achatLotReportPdfFilename(loaded.payload);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
