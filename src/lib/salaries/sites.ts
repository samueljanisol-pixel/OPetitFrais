import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMagasinSiteType,
  MAGASIN_SITE_TYPE_LABELS,
  type MagasinSiteType,
} from "@/lib/magasins/types";

export type SalariesSite = {
  id: string;
  code: string;
  nom: string;
  type: MagasinSiteType;
};

export async function loadSalariesSites(supabase: SupabaseClient): Promise<SalariesSite[]> {
  const { data, error } = await supabase
    .from("magasins")
    .select("id, code, nom, type")
    .order("sort_order", { ascending: true })
    .order("nom", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    code: row.code as string,
    nom: row.nom as string,
    type: isMagasinSiteType(row.type) ? row.type : "magasin",
  }));
}

export async function assertSalariesSiteExists(
  supabase: SupabaseClient,
  siteId: string,
): Promise<boolean> {
  const { data, error } = await supabase.from("magasins").select("id").eq("id", siteId).maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export function formatSalariesSiteLabel(site: SalariesSite): string {
  const base = `${site.nom} (${site.code})`;
  if (site.type === "magasin") return base;
  return `${base} — ${MAGASIN_SITE_TYPE_LABELS[site.type]}`;
}
