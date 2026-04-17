import { NextResponse } from "next/server";
import { executeScheduledFtpSync } from "@/lib/sync/scheduledFtpSync";

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  const token =
    url.searchParams.get("token") ||
    req.headers.get("x-cron-secret") ||
    bearer;
  const expected = process.env.CRON_SECRET || process.env.SYNC_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint: "Définis CRON_SECRET ou SYNC_TOKEN dans .env.local (puis redémarre next dev).",
      },
      { status: 401 },
    );
  }
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await executeScheduledFtpSync();

  if (result.insertError) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        message: result.message,
        processedDays: result.processedDays,
        lastSyncedDate: result.lastSyncedDate,
      },
      { status: 500 },
    );
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        message: result.message,
        processedDays: result.processedDays,
        lastSyncedDate: result.lastSyncedDate,
        syncRunId: result.syncRunId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    processedDays: result.processedDays,
    lastSyncedDate: result.lastSyncedDate,
    syncRunId: result.syncRunId ?? null,
  });
}
