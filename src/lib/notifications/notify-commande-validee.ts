import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { findNotificationRecipients } from "./find-recipients";
import { sendWebPushToUser } from "./send-web-push";
import type { CommandeValideePayload } from "./types";
import { VALIDATION_LIST_URL } from "./types";

type MagasinEmbed = { code?: string; nom?: string } | { code?: string; nom?: string }[] | null;
type SupplierEmbed = { label?: string; code?: string } | { label?: string; code?: string }[] | null;

function oneMagLabel(m: MagasinEmbed): string {
  if (!m) return "—";
  const x = Array.isArray(m) ? m[0] : m;
  return x?.nom ?? x?.code ?? "—";
}

function oneSupplierLabel(s: SupplierEmbed): string {
  if (!s) return "—";
  const x = Array.isArray(s) ? s[0] : s;
  return x?.label ?? x?.code ?? "—";
}

export async function notifyCommandeValidee(params: {
  commandeId: string;
  excludeUserId?: string | null;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: cmd, error: cmdErr } = await supabase
    .from("commande_fournisseur")
    .select("id, magasins(code, nom), ref_supplier(code, label)")
    .eq("id", params.commandeId)
    .maybeSingle();

  if (cmdErr || !cmd) {
    console.error("[notifications] commande load:", cmdErr?.message ?? "Introuvable");
    return;
  }

  const magasinLabel = oneMagLabel(cmd.magasins as MagasinEmbed);
  const supplierLabel = oneSupplierLabel(cmd.ref_supplier as SupplierEmbed);
  const title = "Nouvelle commande validée";
  const body = `${magasinLabel} — ${supplierLabel}`;
  const linkUrl = VALIDATION_LIST_URL;

  const payload: CommandeValideePayload = {
    commandeId: params.commandeId,
    magasinLabel,
    supplierLabel,
  };

  const recipients = await findNotificationRecipients({
    typeKey: "commande_fournisseur.validee",
    excludeUserId: params.excludeUserId,
  });

  if (recipients.length === 0) return;

  const inAppRecipients = recipients.filter((r) => r.inAppEnabled);
  if (inAppRecipients.length > 0) {
    const rows = inAppRecipients.map((r) => ({
      user_id: r.userId,
      type_key: "commande_fournisseur.validee",
      title,
      body,
      link_url: linkUrl,
      payload,
    }));

    const { error: insertErr } = await supabase.from("user_notifications").insert(rows);
    if (insertErr) {
      console.error("[notifications] insert:", insertErr.message, insertErr.code);
      throw new Error(insertErr.message);
    }
    console.info("[notifications] créées:", rows.length, "pour commande", params.commandeId);
  }

  const pushRecipients = recipients.filter((r) => r.pushEnabled);
  await Promise.all(
    pushRecipients.map((r) =>
      sendWebPushToUser({
        userId: r.userId,
        title,
        body,
        url: linkUrl,
      }),
    ),
  );
}
