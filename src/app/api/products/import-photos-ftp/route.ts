import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  runImportProductPhotosFromFtp,
  type ImportPhotosFromFtpResult,
} from "@/lib/products/importPhotosFromFtp";

/** Import FTP + extraction RAR peut dépasser la limite serverless par défaut. */
export const maxDuration = 300;

export async function POST() {
  const gate = await requireApiPermission("produits.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const result: ImportPhotosFromFtpResult = await runImportProductPhotosFromFtp();
    const status = result.ok ? 200 : 422;
    return NextResponse.json(result, { status });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message } satisfies { error: string }, { status: 500 });
  }
}
