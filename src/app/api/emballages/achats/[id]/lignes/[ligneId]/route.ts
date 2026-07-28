import { NextResponse } from "next/server";
import { achatsMutationsDisabledResponse } from "@/lib/emballages/achats-disabled";

type Ctx = { params: Promise<{ id: string; ligneId: string }> };

export async function PATCH(_req: Request, _ctx: Ctx) {
  return achatsMutationsDisabledResponse();
}

export async function DELETE(_req: Request, _ctx: Ctx) {
  return achatsMutationsDisabledResponse();
}
