import { NextResponse } from "next/server";
import { isValidVisitorKey } from "@/lib/shop/analytics-client";
import {
  recordShopHeartbeat,
  todayCasablancaIsoDate,
} from "@/lib/shop/analytics-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type HeartbeatBody = {
  visitorKey?: unknown;
  lineCount?: unknown;
  totalAmount?: unknown;
};

function parseBody(raw: HeartbeatBody): {
  visitorKey: string;
  lineCount: number;
  totalAmount: number;
} | null {
  if (typeof raw.visitorKey !== "string" || !isValidVisitorKey(raw.visitorKey)) return null;

  const lineCount =
    typeof raw.lineCount === "number" && Number.isFinite(raw.lineCount)
      ? Math.min(500, Math.max(0, Math.floor(raw.lineCount)))
      : 0;

  const totalAmount =
    typeof raw.totalAmount === "number" && Number.isFinite(raw.totalAmount)
      ? Math.min(999_999, Math.max(0, raw.totalAmount))
      : 0;

  return { visitorKey: raw.visitorKey, lineCount, totalAmount };
}

export async function POST(request: Request) {
  let body: HeartbeatBody;
  try {
    body = (await request.json()) as HeartbeatBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const visitDate = todayCasablancaIsoDate();
  const { error } = await recordShopHeartbeat(
    supabase,
    parsed.visitorKey,
    parsed.lineCount,
    parsed.totalAmount,
    visitDate,
  );

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
