import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { assertSalariesSiteExists } from "@/lib/salaries/sites";
import type { SalarieRow } from "@/lib/salaries/types";

export async function userCanAccessSalarie(
  supabase: SupabaseClient,
  userId: string,
  salarieId: string,
): Promise<{ ok: true; salarie: SalarieRow } | { ok: false; error: string; status: number }> {
  const { data, error } = await supabase
    .from("salarie")
    .select("id, magasin_id, nom, prenom, date_arrivee, date_depart, notes, profile_id, created_at, updated_at")
    .eq("id", salarieId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: "Salarié introuvable", status: 404 };

  const row = data as SalarieRow;
  return { ok: true, salarie: row };
}

export async function requireSalariesSite(
  siteId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  let service: SupabaseClient;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return { ok: false, error: "Service role non configurée", status: 500 };
  }
  const exists = await assertSalariesSiteExists(service, siteId);
  if (!exists) {
    return { ok: false, error: "Site introuvable", status: 403 };
  }
  return { ok: true };
}

export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function parseTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value;
  return null;
}

export function trimText(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t.length === 0) return null;
  return t.slice(0, maxLen);
}

export function optionalTrimText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

export function requireNonEmptyText(value: unknown, field: string): string | { error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: `${field} requis` };
  }
  return value.trim();
}
