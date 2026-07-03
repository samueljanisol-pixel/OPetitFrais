import webpush from "web-push";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { PushSubscriptionRow } from "./types";

function getVapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@opetitfrais.fr";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

export async function sendWebPushToUser(params: {
  userId: string;
  title: string;
  body: string;
  url: string;
}): Promise<void> {
  const vapid = getVapidConfig();
  if (!vapid) {
    console.warn("[notifications] Web Push non configuré (clés VAPID manquantes)");
    return;
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const supabase = createSupabaseServiceRoleClient();
  const { data: subs, error } = await supabase
    .from("user_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", params.userId);

  if (error) {
    console.error("[notifications] push subscriptions:", error.message);
    return;
  }

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    url: params.url,
  });

  for (const sub of (subs ?? []) as Pick<PushSubscriptionRow, "id" | "endpoint" | "p256dh" | "auth">[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("user_push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("[notifications] push send failed:", err);
      }
    }
  }
}
