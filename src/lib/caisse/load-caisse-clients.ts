import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type CaisseClientRow = {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  notes: string | null;
  actif: boolean;
  sort_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type CaisseClientDto = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  sortOrder: number;
  balanceDue: number;
  isSystem: boolean;
};

export type CaisseClientsPayload = {
  clients: CaisseClientDto[];
  fetchedAt: string;
};

const CLIENT_SELECT =
  "id, nom, telephone, email, notes, actif, sort_order, is_system, created_at, updated_at";

export function mapCaisseClientRow(row: CaisseClientRow): CaisseClientDto {
  return {
    id: row.id,
    name: row.nom.trim(),
    phone: row.telephone?.trim() || null,
    email: row.email?.trim() || null,
    notes: row.notes?.trim() || null,
    active: row.actif,
    sortOrder: row.sort_order,
    balanceDue: 0,
    isSystem: row.is_system,
  };
}

export async function loadCaisseClients(opts?: {
  activeOnly?: boolean;
}): Promise<{ payload: CaisseClientsPayload | null; error: string | null }> {
  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Configuration Supabase incomplète";
    return { payload: null, error: msg };
  }

  let query = supabase
    .from("caisse_client")
    .select(CLIENT_SELECT)
    .order("sort_order", { ascending: true })
    .order("nom", { ascending: true });

  if (opts?.activeOnly !== false) {
    query = query.eq("actif", true);
  }

  const { data, error } = await query;

  if (error) return { payload: null, error: error.message };

  const rows = (data ?? []) as CaisseClientRow[];
  const clients = rows.map(mapCaisseClientRow);

  return {
    payload: {
      clients,
      fetchedAt: new Date().toISOString(),
    },
    error: null,
  };
}

export async function createCaisseClient(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  sortOrder?: number;
}): Promise<{ client: CaisseClientDto | null; error: string | null }> {
  const name = input.name.trim();
  if (!name) return { client: null, error: "Nom requis" };

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Configuration Supabase incomplète";
    return { client: null, error: msg };
  }

  const { data, error } = await supabase
    .from("caisse_client")
    .insert({
      nom: name,
      telephone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
      sort_order: input.sortOrder ?? 100,
      actif: true,
      is_system: false,
    })
    .select(CLIENT_SELECT)
    .single();

  if (error) return { client: null, error: error.message };
  if (!data) return { client: null, error: "Création impossible" };

  return { client: mapCaisseClientRow(data as CaisseClientRow), error: null };
}

export async function updateCaisseClient(
  id: string,
  input: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    active?: boolean;
  },
): Promise<{ client: CaisseClientDto | null; error: string | null; status?: number }> {
  const trimmedId = id.trim();
  if (!trimmedId) return { client: null, error: "Id requis", status: 400 };

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Configuration Supabase incomplète";
    return { client: null, error: msg, status: 500 };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("caisse_client")
    .select("id, is_system")
    .eq("id", trimmedId)
    .maybeSingle();

  if (fetchError) return { client: null, error: fetchError.message, status: 500 };
  if (!existing) return { client: null, error: "Client introuvable", status: 404 };

  const patch: Record<string, unknown> = {};

  if ("name" in input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return { client: null, error: "Nom requis", status: 400 };
    if (!existing.is_system) {
      patch.nom = name;
    }
  }
  if ("phone" in input) patch.telephone = input.phone?.trim() || null;
  if ("email" in input) patch.email = input.email?.trim() || null;
  if ("notes" in input) patch.notes = input.notes?.trim() || null;
  if ("active" in input) {
    if (existing.is_system && input.active === false) {
      return { client: null, error: "Client système non désactivable", status: 409 };
    }
    patch.actif = input.active;
  }

  if (Object.keys(patch).length === 0) {
    return { client: null, error: "Aucun champ à mettre à jour", status: 400 };
  }

  const { data, error } = await supabase
    .from("caisse_client")
    .update(patch)
    .eq("id", trimmedId)
    .select(CLIENT_SELECT)
    .maybeSingle();

  if (error) return { client: null, error: error.message, status: 500 };
  if (!data) return { client: null, error: "Client introuvable", status: 404 };

  return { client: mapCaisseClientRow(data as CaisseClientRow), error: null };
}
