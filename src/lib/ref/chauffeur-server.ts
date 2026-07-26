import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAUFFEUR_USER_ID_SETTING_KEY,
  chauffeurDisplayName,
  type ChauffeurProfile,
} from "@/lib/ref/chauffeur-setting";

export type ChauffeurUserOption = {
  userId: string;
  prenom: string;
  nom: string;
  phone: string | null;
  displayName: string;
};

export async function loadChauffeurProfile(
  service: SupabaseClient,
): Promise<{ chauffeur: ChauffeurProfile | null; userId: string | null }> {
  const { data: setting, error: se } = await service
    .from("ref_app_setting")
    .select("value")
    .eq("key", CHAUFFEUR_USER_ID_SETTING_KEY)
    .maybeSingle();
  if (se) {
    throw new Error(se.message);
  }
  const userId = typeof setting?.value === "string" && setting.value.trim().length > 0 ? setting.value.trim() : null;
  if (!userId) {
    return { chauffeur: null, userId: null };
  }

  const { data: profile, error: pe } = await service
    .from("profiles")
    .select("user_id, prenom, nom, phone")
    .eq("user_id", userId)
    .maybeSingle();
  if (pe) {
    throw new Error(pe.message);
  }
  if (!profile) {
    return { chauffeur: null, userId };
  }

  const row = profile as { user_id: string; prenom: string; nom: string; phone: string | null };
  const prenom = row.prenom ?? "";
  const nom = row.nom ?? "";
  const phone = typeof row.phone === "string" && row.phone.trim().length > 0 ? row.phone.trim() : null;
  return {
    userId,
    chauffeur: {
      userId: row.user_id,
      prenom,
      nom,
      phone,
      displayName: chauffeurDisplayName(prenom, nom),
    },
  };
}

export async function listChauffeurUserOptions(service: SupabaseClient): Promise<ChauffeurUserOption[]> {
  const { data, error } = await service
    .from("profiles")
    .select("user_id, prenom, nom, phone")
    .order("nom", { ascending: true })
    .order("prenom", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => {
    const typed = row as { user_id: string; prenom: string; nom: string; phone: string | null };
    const prenom = typed.prenom ?? "";
    const nom = typed.nom ?? "";
    return {
      userId: typed.user_id,
      prenom,
      nom,
      phone: typeof typed.phone === "string" && typed.phone.trim().length > 0 ? typed.phone.trim() : null,
      displayName: chauffeurDisplayName(prenom, nom),
    };
  });
}
