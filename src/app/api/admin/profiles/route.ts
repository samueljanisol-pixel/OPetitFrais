import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { parseIsCaissier, parseOptionalCaissePin, resolveCaissePinHash } from "@/lib/caisse/admin-caissier";

function mapProfileRow(p: {
  user_id: string;
  login: string | null;
  prenom: string;
  nom: string;
  phone?: string | null;
  role_id: string;
  is_caissier?: boolean | null;
  caisse_pin_hash?: string | null;
  roles: unknown;
  profile_magasins?: unknown[] | null;
}) {
  const links = (p.profile_magasins ?? []) as Array<{
    magasin_id?: string;
    magasins?: { id: string; code: string; nom: string } | null;
  }>;
  const magasins = links
    .map((l) => l.magasins)
    .filter((m): m is { id: string; code: string; nom: string } => Boolean(m?.id));
  const pinHash = typeof p.caisse_pin_hash === "string" ? p.caisse_pin_hash.trim() : "";
  return {
    user_id: p.user_id,
    login: p.login,
    prenom: p.prenom,
    nom: p.nom,
    phone: typeof p.phone === "string" && p.phone.trim().length > 0 ? p.phone.trim() : null,
    role_id: p.role_id,
    roles: p.roles,
    magasins,
    is_caissier: p.is_caissier === true,
    has_caisse_pin: pinHash.length > 0,
  };
}

export async function GET() {
  const gate = await requireApiPermission("admin.utilisateurs");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: profiles, error } = await service
    .from("profiles")
    .select(
      "user_id, login, prenom, nom, phone, role_id, is_caissier, caisse_pin_hash, roles(id, name, slug), profile_magasins(magasin_id, magasins(id, code, nom))",
    )
    .order("nom", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: authUsers, error: ae } = await service.auth.admin.listUsers({ perPage: 1000 });
  if (ae) {
    return NextResponse.json({ error: ae.message }, { status: 500 });
  }

  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  const rows = (profiles ?? []).map((p) => ({
    ...mapProfileRow(p),
    email: emailById.get(p.user_id) ?? "",
  }));

  return NextResponse.json({ profiles: rows });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("admin.utilisateurs");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: {
    email?: string;
    login?: string;
    password?: string;
    prenom?: string;
    nom?: string;
    phone?: string | null;
    role_id?: string;
    magasin_ids?: string[];
    is_caissier?: boolean;
    caisse_pin?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const password = body.password ?? "";
  const prenom = (body.prenom ?? "").trim();
  const nom = (body.nom ?? "").trim();
  const phoneRaw = body.phone;
  const phone =
    phoneRaw === null || phoneRaw === undefined || String(phoneRaw).trim().length === 0
      ? null
      : String(phoneRaw).trim();
  const role_id = body.role_id ?? "";
  const emailRaw = (body.email ?? "").trim();
  const loginRaw = (body.login ?? "").trim();

  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Mot de passe (min. 6 caractères) requis" }, { status: 400 });
  }
  if (!role_id) {
    return NextResponse.json({ error: "Rôle requis" }, { status: 400 });
  }
  if (!emailRaw && !loginRaw) {
    return NextResponse.json({ error: "Email ou identifiant de connexion (login) requis" }, { status: 400 });
  }

  const email = emailRaw || `${randomUUID()}@internal.opf`;

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: created, error: ce } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { prenom, nom, login: loginRaw || null },
  });

  if (ce || !created.user) {
    return NextResponse.json({ error: ce?.message ?? "Création Auth impossible" }, { status: 400 });
  }

  const { data: updatedRows, error: pe } = await service
    .from("profiles")
    .update({
      login: loginRaw || null,
      prenom,
      nom,
      phone,
      role_id,
    })
    .eq("user_id", created.user.id)
    .select("user_id");

  if (pe) {
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: pe.message }, { status: 400 });
  }

  if (!updatedRows?.length) {
    const { error: ie } = await service.from("profiles").insert({
      user_id: created.user.id,
      login: loginRaw || null,
      prenom,
      nom,
      phone,
      role_id,
    });
    if (ie) {
      await service.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: ie.message }, { status: 400 });
    }
  }

  const isCaissier = parseIsCaissier(body.is_caissier) === true;
  const caissePin = parseOptionalCaissePin(body.caisse_pin);
  const pinResolved = await resolveCaissePinHash({
    isCaissier,
    pin: caissePin,
    existingHash: null,
    requirePinIfNew: true,
  });
  if (!pinResolved.ok) {
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: pinResolved.error }, { status: 400 });
  }

  const magasinIds = Array.isArray(body.magasin_ids) ? body.magasin_ids : undefined;
  if (isCaissier && (!magasinIds || magasinIds.length === 0)) {
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Un caissier doit être rattaché à au moins un magasin" },
      { status: 400 },
    );
  }

  const { error: caissierE } = await service
    .from("profiles")
    .update({
      is_caissier: isCaissier,
      caisse_pin_hash: pinResolved.hash,
    })
    .eq("user_id", created.user.id);
  if (caissierE) {
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: caissierE.message }, { status: 400 });
  }

  if (magasinIds !== undefined) {
    const mg = await requireApiPermission("admin.magasins");
    if (!mg.ok) {
      return NextResponse.json({ error: mg.error }, { status: mg.status });
    }
    if (magasinIds.length > 0) {
      const { data: magOk } = await service.from("magasins").select("id").in("id", magasinIds);
      if (!magOk || magOk.length !== magasinIds.length) {
        return NextResponse.json({ error: "Un ou plusieurs magasins sont invalides" }, { status: 400 });
      }
    }
    const { error: delE } = await service.from("profile_magasins").delete().eq("user_id", created.user.id);
    if (delE) {
      return NextResponse.json({ error: delE.message }, { status: 400 });
    }
    if (magasinIds.length > 0) {
      const { error: insE } = await service
        .from("profile_magasins")
        .insert(magasinIds.map((mid) => ({ user_id: created.user.id, magasin_id: mid })));
      if (insE) {
        return NextResponse.json({ error: insE.message }, { status: 400 });
      }
    }
  }

  return NextResponse.json({
    profile: {
      user_id: created.user.id,
      email: created.user.email,
      login: loginRaw || null,
      prenom,
      nom,
      phone,
      role_id,
      is_caissier: isCaissier,
      has_caisse_pin: pinResolved.hash != null,
    },
  });
}
