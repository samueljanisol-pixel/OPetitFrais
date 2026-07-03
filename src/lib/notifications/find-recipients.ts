import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { NotificationTypeKey } from "./types";
import { NOTIFICATION_TYPE_PERMISSIONS } from "./types";

export type NotificationRecipient = {
  userId: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
};

function normalizeUuidList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length > 0) {
      ids.push(item);
      continue;
    }
    if (item && typeof item === "object") {
      for (const value of Object.values(item as Record<string, unknown>)) {
        if (typeof value === "string" && value.length > 0) {
          ids.push(value);
        }
      }
    }
  }
  return ids;
}

async function loadUserIdsWithPermission(permissionKey: string): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: rpcData, error: rpcErr } = await supabase.rpc("profiles_with_permission", {
    p_key: permissionKey,
  });

  if (!rpcErr) {
    const fromRpc = normalizeUuidList(rpcData);
    if (fromRpc.length > 0) return fromRpc;
  } else {
    console.warn("[notifications] profiles_with_permission RPC:", rpcErr.message);
  }

  const { data: perm, error: permErr } = await supabase
    .from("permissions")
    .select("id")
    .eq("key", permissionKey)
    .maybeSingle();

  if (permErr) {
    console.error("[notifications] permission lookup:", permErr.message);
    return [];
  }

  const ids = new Set<string>();

  const { data: fullAccessProfiles, error: faErr } = await supabase
    .from("profiles")
    .select("user_id, roles!inner(is_full_access)")
    .eq("roles.is_full_access", true);

  if (faErr) {
    console.error("[notifications] full access profiles:", faErr.message);
  } else {
    for (const row of fullAccessProfiles ?? []) {
      if (typeof row.user_id === "string") ids.add(row.user_id);
    }
  }

  if (perm?.id) {
    const { data: rolePerms, error: rpErr } = await supabase
      .from("role_permissions")
      .select("role_id")
      .eq("permission_id", perm.id);

    if (rpErr) {
      console.error("[notifications] role_permissions:", rpErr.message);
    } else {
      const roleIds = (rolePerms ?? [])
        .map((r) => r.role_id as string)
        .filter((id) => id.length > 0);

      if (roleIds.length > 0) {
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("user_id")
          .in("role_id", roleIds);

        if (profErr) {
          console.error("[notifications] profiles by role:", profErr.message);
        } else {
          for (const row of profiles ?? []) {
            if (typeof row.user_id === "string") ids.add(row.user_id);
          }
        }
      }
    }
  }

  return [...ids];
}

export async function findNotificationRecipients(params: {
  typeKey: NotificationTypeKey;
  excludeUserId?: string | null;
}): Promise<NotificationRecipient[]> {
  const permissionKey = NOTIFICATION_TYPE_PERMISSIONS[params.typeKey];
  const supabase = createSupabaseServiceRoleClient();

  const userIds = (await loadUserIdsWithPermission(permissionKey)).filter(
    (id) => id !== params.excludeUserId,
  );

  if (userIds.length === 0) {
    console.warn("[notifications] aucun destinataire pour", permissionKey);
    return [];
  }

  const { data: prefs, error: prefErr } = await supabase
    .from("user_notification_preferences")
    .select("user_id, in_app_enabled, push_enabled")
    .eq("type_key", params.typeKey)
    .in("user_id", userIds);

  if (prefErr) {
    console.warn("[notifications] preferences (defaults used):", prefErr.message);
  }

  const prefMap = new Map(
    (prefs ?? []).map((p) => [
      p.user_id as string,
      {
        inAppEnabled: p.in_app_enabled as boolean,
        pushEnabled: p.push_enabled as boolean,
      },
    ]),
  );

  const recipients: NotificationRecipient[] = [];
  for (const userId of userIds) {
    const pref = prefMap.get(userId);
    const inAppEnabled = pref?.inAppEnabled ?? true;
    const pushEnabled = pref?.pushEnabled ?? false;
    if (!inAppEnabled && !pushEnabled) continue;
    recipients.push({ userId, inAppEnabled, pushEnabled });
  }

  if (recipients.length === 0) {
    console.warn("[notifications] destinataires filtrés (préférences désactivées)");
  }

  return recipients;
}
