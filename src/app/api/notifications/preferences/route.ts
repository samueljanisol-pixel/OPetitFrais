import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/notifications/require-auth";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isNotificationTypeKey,
  notificationTypesForPermissions,
  NOTIFICATION_TYPE_PERMISSIONS,
  type NotificationPreferenceRow,
  type NotificationTypeKey,
} from "@/lib/notifications/types";
import { isWebPushConfigured } from "@/lib/notifications/send-web-push";

export async function GET() {
  const gate = await requireAuthenticatedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const availableTypes = notificationTypesForPermissions(gate.permissions, gate.isFullAccess);
  const supabase = await createSupabaseServerClient();

  const { data: rows, error } = await supabase
    .from("user_notification_preferences")
    .select("type_key, in_app_enabled, push_enabled")
    .eq("user_id", gate.userId)
    .in("type_key", availableTypes);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rowMap = new Map(
    (rows ?? []).map((r) => [
      r.type_key as NotificationTypeKey,
      {
        in_app_enabled: r.in_app_enabled as boolean,
        push_enabled: r.push_enabled as boolean,
      },
    ]),
  );

  const preferences = availableTypes.map((typeKey) => {
    const stored = rowMap.get(typeKey);
    const defaults = DEFAULT_NOTIFICATION_PREFERENCES[typeKey];
    return {
      typeKey,
      permission: NOTIFICATION_TYPE_PERMISSIONS[typeKey],
      inAppEnabled: stored?.in_app_enabled ?? defaults.in_app_enabled,
      pushEnabled: stored?.push_enabled ?? defaults.push_enabled,
    };
  });

  return NextResponse.json({
    preferences,
    pushConfigured: isWebPushConfigured(),
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

export async function PATCH(req: Request) {
  const gate = await requireAuthenticatedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: {
    typeKey?: string;
    inAppEnabled?: boolean;
    pushEnabled?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const typeKey = body.typeKey;
  if (!typeKey || !isNotificationTypeKey(typeKey)) {
    return NextResponse.json({ error: "Type de notification invalide" }, { status: 400 });
  }

  const availableTypes = notificationTypesForPermissions(gate.permissions, gate.isFullAccess);
  if (!availableTypes.includes(typeKey)) {
    return NextResponse.json({ error: "Permission refusée pour ce type" }, { status: 403 });
  }

  const defaults = DEFAULT_NOTIFICATION_PREFERENCES[typeKey];
  const inAppEnabled = body.inAppEnabled ?? defaults.in_app_enabled;
  const pushEnabled = body.pushEnabled ?? defaults.push_enabled;

  const supabase = await createSupabaseServerClient();
  const row: Omit<NotificationPreferenceRow, "user_id"> & { user_id: string; updated_at: string } = {
    user_id: gate.userId,
    type_key: typeKey,
    in_app_enabled: inAppEnabled,
    push_enabled: pushEnabled,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("user_notification_preferences").upsert(row, {
    onConflict: "user_id,type_key",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    preference: {
      typeKey,
      inAppEnabled,
      pushEnabled,
    },
  });
}
