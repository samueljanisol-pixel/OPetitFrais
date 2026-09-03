/**
 * Recherche lot créé le 06/08/2026 ~21:49 (UTC+1).
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase non configuré (.env.local)");

const sb = createClient(url, key);

function relLabel(raw: unknown): string {
  if (raw == null) return "?";
  const o = Array.isArray(raw) ? raw[0] : raw;
  if (o && typeof o === "object" && "label" in o) {
    const lb = (o as { label?: string }).label;
    return typeof lb === "string" ? lb : "?";
  }
  return "?";
}

async function main() {
  const out: string[] = [];

  const { data: lots, error: lotErr } = await sb
    .from("commande_fournisseur_lot")
    .select(
      "id, status, created_at, marque_terminee_at, date_livraison, supplier_id, ref_supplier(label, code)",
    )
    .order("created_at", { ascending: false });

  if (lotErr) throw new Error(lotErr.message);

  const matches = (lots ?? []).filter((l) => {
    const created = String((l as { created_at: string }).created_at);
    return (
      created.includes("2026-08-06T20:49") ||
      created.includes("2026-08-06T21:49") ||
      created.includes("2026-08-06T19:49")
    );
  });

  out.push(`Lots total: ${lots?.length ?? 0}`);
  out.push(`Candidats 21h49: ${matches.length}`);
  out.push("");

  for (const lot of matches) {
    const lotId = String((lot as { id: string }).id);
    out.push("=== LOT ===");
    out.push(`id: ${lotId}`);
    out.push(`fournisseur: ${relLabel((lot as { ref_supplier?: unknown }).ref_supplier)}`);
    out.push(`status: ${(lot as { status: string }).status}`);
    out.push(`created_at: ${(lot as { created_at: string }).created_at}`);
    out.push(
      `marque_terminee_at: ${(lot as { marque_terminee_at?: string | null }).marque_terminee_at ?? "null"}`,
    );
    out.push(`date_livraison: ${(lot as { date_livraison?: string | null }).date_livraison ?? "null"}`);

    const { data: inclusions } = await sb
      .from("commande_fournisseur_lot_inclusion")
      .select("commande_id")
      .eq("lot_id", lotId);
    const inclusionIds = (inclusions ?? []).map((i) => String((i as { commande_id: string }).commande_id));

    const { data: cmdByLot } = await sb
      .from("commande_fournisseur")
      .select("id, created_at, status, lot_id")
      .eq("lot_id", lotId);

    const { data: cmdByInc } =
      inclusionIds.length > 0
        ? await sb
            .from("commande_fournisseur")
            .select("id, created_at, status, lot_id")
            .in("id", inclusionIds)
        : { data: [] as unknown[] };

    const commandeMap = new Map<string, Record<string, unknown>>();
    for (const c of [...(cmdByLot ?? []), ...(cmdByInc ?? [])]) {
      commandeMap.set(String((c as { id: string }).id), c as Record<string, unknown>);
    }

    out.push(`commandes liées: ${commandeMap.size}`);
    for (const c of commandeMap.values()) {
      out.push(
        `  - ${String(c.id)} | ${String(c.status)} | ${String(c.created_at)} | lot_id=${String(c.lot_id ?? "null")}`,
      );
    }

    const { data: achats, error: achErr } = await sb
      .from("fournisseur_compte_achat")
      .select("id, kind, vendeur_id, montant_total, date_cloture")
      .eq("lot_id", lotId);
    if (achErr) throw new Error(achErr.message);

    out.push(`achats comptables: ${achats?.length ?? 0}`);
    const achatIds = (achats ?? []).map((a) => String((a as { id: string }).id));
    let paidCount = 0;

    if (achatIds.length > 0) {
      const { data: links, error: payErr } = await sb
        .from("fournisseur_paiement_achat")
        .select("achat_id, paiement_id")
        .in("achat_id", achatIds);
      if (payErr) throw new Error(payErr.message);
      const paidSet = new Set((links ?? []).map((l) => String((l as { achat_id: string }).achat_id)));
      for (const a of achats ?? []) {
        const aid = String((a as { id: string }).id);
        const paid = paidSet.has(aid);
        if (paid) {
          paidCount += 1;
          out.push(
            `  PAYÉ achat ${aid} | kind=${(a as { kind: string }).kind} | montant=${(a as { montant_total: number }).montant_total}`,
          );
        } else {
          out.push(
            `  impayé achat ${aid} | kind=${(a as { kind: string }).kind} | montant=${(a as { montant_total: number }).montant_total}`,
          );
        }
      }
    }

    out.push(`ACHATS PAYÉS: ${paidCount}`);
    out.push("");
  }

  if (matches.length === 0) {
    out.push("Aucun lot à 21h49 — tous les lots du 06/08/2026:");
    for (const l of (lots ?? []).filter((x) =>
      String((x as { created_at: string }).created_at).startsWith("2026-08-06"),
    )) {
      out.push(
        `${(l as { created_at: string }).created_at} | ${relLabel((l as { ref_supplier?: unknown }).ref_supplier)} | ${(l as { status: string }).status} | closed=${(l as { marque_terminee_at?: string | null }).marque_terminee_at ?? "null"} | ${(l as { id: string }).id}`,
      );
    }
  }

  const text = out.join("\n");
  console.log(text);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
