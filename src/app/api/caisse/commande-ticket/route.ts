import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { loadCommandeTicketPayload } from "@/lib/caisse/commande-ticket-data";
import {
  buildCommandeTicketPdf,
  countTicketPdfPages,
} from "@/lib/caisse/commande-ticket-pdf";
import {
  buildCommandeTicketEscPos,
  buildCommandeTicketJson,
} from "@/lib/caisse/commande-ticket-text";
import { parseTicketLang } from "@/lib/caisse/ticket-lang";
import { isValidTicketDateIso } from "@/lib/caisse/ticket-day-bounds";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TicketFormat = "json" | "txt" | "pdf" | "meta";

function parseFormat(req: NextRequest): TicketFormat {
  const raw = (req.nextUrl.searchParams.get("format") ?? "").trim().toLowerCase();
  if (raw === "txt" || raw === "text") return "txt";
  if (raw === "pdf") return "pdf";
  if (raw === "meta") return "meta";
  if (raw === "json" || raw === "") return "json";
  if ((req.nextUrl.searchParams.get("meta") ?? "").trim() === "1") return "meta";
  // Ancien défaut PDF si page= est présent sans format
  if ((req.nextUrl.searchParams.get("page") ?? "").trim().length > 0) return "pdf";
  return "json";
}

/**
 * Ticket commande magasin pour caisse WinDev.
 *
 * Recommandé :
 * - `format=json` (défaut) → données pour état / impression native WinDev
 * - `format=txt` → binaire ESC/POS 64 col. (+ `encode=base64` recommandé WinDev)
 *
 * Legacy PDF : `format=pdf` (+ optionnel `page=`)
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) {
    return auth.response;
  }

  const magasin = (req.nextUrl.searchParams.get("magasin") ?? "").trim();
  if (!magasin) {
    return NextResponse.json({ error: "Paramètre magasin requis." }, { status: 400 });
  }

  const dateParam = (req.nextUrl.searchParams.get("date") ?? "").trim();
  const dateIso = dateParam.length > 0 ? dateParam : null;
  if (dateIso && !isValidTicketDateIso(dateIso)) {
    return NextResponse.json(
      { error: "Paramètre date invalide (attendu YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const lang = parseTicketLang(req.nextUrl.searchParams.get("lang"));
  const format = parseFormat(req);

  const pageRaw = (req.nextUrl.searchParams.get("page") ?? "").trim();
  let page: number | undefined;
  if (pageRaw.length > 0) {
    const n = Number(pageRaw);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json(
        { error: "Paramètre page invalide (entier ≥ 1)." },
        { status: 400 },
      );
    }
    page = n;
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const loaded = await loadCommandeTicketPayload(supabase, magasin, dateIso, lang);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const day = loaded.payload.dateIso || "na";
  const baseName = `commande-${loaded.payload.magasin.code}-${day}-${lang}`;

  if (format === "meta") {
    return NextResponse.json(
      {
        pages: countTicketPdfPages(loaded.payload),
        magasin: loaded.payload.magasin.code,
        dateIso: loaded.payload.dateIso,
        suppliers: loaded.payload.suppliers.map((s) => s.supplierLabel),
        formats: ["json", "txt", "pdf"],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (format === "json") {
    return NextResponse.json(buildCommandeTicketJson(loaded.payload), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (format === "txt") {
    const bytes = await buildCommandeTicketEscPos(loaded.payload);
    // base64 : WinDev ne ré-encode pas en UTF-8 (corrige è → Ã¨)
    const asBase64 =
      (req.nextUrl.searchParams.get("encode") ?? "").trim().toLowerCase() === "base64";
    if (asBase64) {
      return new NextResponse(bytes.toString("base64"), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=us-ascii",
          "Content-Disposition": `inline; filename="${baseName}.b64"`,
          "Cache-Control": "no-store",
        },
      });
    }
    // octet-stream : évite que le client HTTP convertisse en UTF-8
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename="${baseName}.bin"`,
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const pdf = await buildCommandeTicketPdf(loaded.payload, { page });
    const pageSuffix = page != null ? `-p${page}` : "";
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${baseName}${pageSuffix}.pdf"`,
        "Cache-Control": "no-store",
        "X-Ticket-Pages": String(countTicketPdfPages(loaded.payload)),
      },
    });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 500;
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status });
  }
}
