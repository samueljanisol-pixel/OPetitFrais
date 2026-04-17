/**
 * Import complet : toutes les dates jour trouvées sur le FTP → Supabase.
 *
 * Usage :
 *   npm run sync:all
 *   npm run sync:all -- 2026-01-01 2026-04-30    (borne optionnelle from / to)
 *
 * Limite de sécurité : SYNC_ALL_MAX_DAYS=100 (nombre max de jours traités après filtres).
 */

import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { syncAllFtpDatesToSupabase } = await import("../src/lib/sync/ftpToSupabase");

  const from = process.argv[2];
  const to = process.argv[3];
  const maxEnv = process.env.SYNC_ALL_MAX_DAYS;
  const maxDays =
    maxEnv != null && maxEnv !== "" && Number.isFinite(Number(maxEnv)) && Number(maxEnv) > 0
      ? Number(maxEnv)
      : undefined;

  console.log("Scan FTP des dates…");
  const r = await syncAllFtpDatesToSupabase({
    from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
    to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : undefined,
    maxDays,
    onProgress: ({ date, index, total }) => {
      console.log(`[${index + 1}/${total}] ${date}`);
    },
  });

  console.log(
    "Résumé :",
    JSON.stringify(
      {
        joursRepérés: r.dates.length,
        importésSansErreur: r.processed,
        erreurs: r.errors.length,
      },
      null,
      2,
    ),
  );

  if (r.errors.length) {
    console.error("Détail des erreurs :", r.errors);
    process.exit(1);
  }
}

void main();
