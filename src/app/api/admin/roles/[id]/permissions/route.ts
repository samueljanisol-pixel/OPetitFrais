import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireApiPermission("admin.roles");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: roleId } = await ctx.params;
  let body: { permissionIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const permissionIds = Array.isArray(body.permissionIds) ? body.permissionIds : [];

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: role } = await service.from("roles").select("is_full_access").eq("id", roleId).maybeSingle();
  if (role?.is_full_access) {
    return NextResponse.json({ error: "Rôle à accès total : matrice ignorée" }, { status: 400 });
  }

  const { error: delErr } = await service.from("role_permissions").delete().eq("role_id", roleId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (permissionIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const rows = permissionIds.map((permission_id) => ({ role_id: roleId, permission_id }));
  const { error: insErr } = await service.from("role_permissions").insert(rows);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
