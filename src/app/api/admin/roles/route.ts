import { NextResponse } from "next/server";
import { roleSlugFromName } from "@/lib/auth/role-slug";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";

export async function GET() {
  const gate = await requireAnyApiPermission(["admin.roles", "admin.utilisateurs"]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const [{ data: roles, error: re }, { data: permissions, error: pe }] = await Promise.all([
    service.from("roles").select("id, slug, name, description, is_system, is_full_access").order("name"),
    service.from("permissions").select("id, key, description, module, sort_order").order("sort_order"),
  ]);

  if (re || pe) {
    return NextResponse.json({ error: re?.message ?? pe?.message ?? "Erreur lecture" }, { status: 500 });
  }

  const { data: links, error: le } = await service.from("role_permissions").select("role_id, permission_id");
  if (le) {
    return NextResponse.json({ error: le.message }, { status: 500 });
  }

  return NextResponse.json({
    roles: roles ?? [],
    permissions: permissions ?? [],
    role_permissions: links ?? [],
  });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("admin.roles");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { slug?: string; name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const slugExplicit = (body.slug ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const slug = slugExplicit || roleSlugFromName(name);
  if (!name || !slug) {
    return NextResponse.json({ error: "Nom requis (code généré automatiquement)" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data, error } = await service
    .from("roles")
    .insert({ slug, name, description: body.description ?? "", is_system: false, is_full_access: false })
    .select("id, slug, name, description, is_system, is_full_access")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ role: data });
}
