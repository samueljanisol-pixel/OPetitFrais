import { NextResponse } from "next/server";
import { achatsMutationsDisabledResponse } from "@/lib/emballages/achats-disabled";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, _ctx: Ctx) {
  return achatsMutationsDisabledResponse();
}
