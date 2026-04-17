/**
 * Import FTP → JSON → Supabase pour une date (ca_day, ca_month, ca_product_day).
 * Charge `.env.local` puis appelle `syncDateToSupabase`.
 *
 * Usage : npm run sync:day -- 2026-04-16
 */

import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { recordSyncRun, syncDateToSupabase } = await import("../src/lib/sync/ftpToSupabase");

  const date = process.argv[2] ?? new Date().toISOString().split("T")[0];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("Date invalide. Utilise YYYY-MM-DD.");
    process.exit(1);
  }

  const started_at = new Date().toISOString();
  try {
    const result = await syncDateToSupabase(date);
    console.log("Import terminé :", JSON.stringify(result, null, 2));
    try {
      await recordSyncRun({
        started_at,
        status: "success",
        message: null,
        last_synced_date: date,
        processed_days: 1,
      });
    } catch (err) {
      console.warn("sync_runs non mis à jour :", err instanceof Error ? err.message : err);
    }
  } catch (e) {
    console.error("Échec import :", e instanceof Error ? e.message : e);
    try {
      await recordSyncRun({
        started_at,
        status: "error",
        message: e instanceof Error ? e.message : String(e),
        last_synced_date: null,
        processed_days: 0,
      });
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

void main();
