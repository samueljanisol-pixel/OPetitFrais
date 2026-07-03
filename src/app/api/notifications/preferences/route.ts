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

type PreferenceDto = {
  typeKey: NotificationTypeKey;
  permission: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
};

async function loadPreferencesDto(
  userId: string,
  availableTypes: NotificationTypeKey[],
): Promise<PreferenceDto[]> {
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("user_notification_preferences")
    .select("type_key, in_app_enabled, push_enabled")
    .eq("user_id", userId)
    .in("type_key", availableTypes);

  if (error) {
    throw new Error(error.message);
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

  return availableTypes.map((typeKey) => {
    const stored = rowMap.get(typeKey);
    const defaults = DEFAULT_NOTIFICATION_PREFERENCES[typeKey];
    return {
      typeKey,
      permission: NOTIFICATION_TYPE_PERMISSIONS[typeKey],
      inAppEnabled: stored?.in_app_enabled ?? defaults.in_app_enabled,
      pushEnabled: stored?.push_enabled ?? defaults.push_enabled,
    };
  });
}

function summarizeGlobals(preferences: PreferenceDto[]) {
  return {
    globalInAppEnabled: preferences.length > 0 && preferences.every((p) => p.inAppEnabled),
    globalPushEnabled: preferences.length > 0 && preferences.every((p) => p.pushEnabled),
  };
}

export async function GET() {
  const gate = await requireAuthenticatedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const availableTypes = notificationTypesForPermissions(gate.permissions, gate.isFullAccess);

  try {
    const preferences = await loadPreferencesDto(gate.userId, availableTypes);
    const globals = summarizeGlobals(preferences);

    return NextResponse.json({
      preferences,
      ...globals,
      pushConfigured: isWebPushConfigured(),
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur serveur" },
      { status: 500 },
    );
  }
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
    global?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const availableTypes = notificationTypesForPermissions(gate.permissions, gate.isFullAccess);
  if (availableTypes.length === 0) {
    return NextResponse.json({ error: "Aucun type de notification disponible" }, { status: 403 });
  }

  const targetTypes: NotificationTypeKey[] = body.global
    ? availableTypes
    : body.typeKey && isNotificationTypeKey(body.typeKey)
      ? [body.typeKey]
      : [];

  if (targetTypes.length === 0) {
    return NextResponse.json({ error: "Type de notification invalide" }, { status: 400 });
  }

  for (const typeKey of targetTypes) {
    if (!availableTypes.includes(typeKey)) {
      return NextResponse.json({ error: "Permission refusée pour ce type" }, { status: 403 });
    }
  }

  const supabase = await createSupabaseServerClient();

  let existing: PreferenceDto[];
  try {
    existing = await loadPreferencesDto(gate.userId, availableTypes);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur serveur" },
      { status: 500 },
    );
  }

  const existingMap = new Map(existing.map((p) => [p.typeKey, p]));

  for (const typeKey of targetTypes) {
    const defaults = DEFAULT_NOTIFICATION_PREFERENCES[typeKey];
    const current = existingMap.get(typeKey);
    const inAppEnabled = body.inAppEnabled ?? current?.inAppEnabled ?? defaults.in_app_enabled;
    const pushEnabled = body.pushEnabled ?? current?.pushEnabled ?? defaults.push_enabled;

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
  }

  try {
    const preferences = await loadPreferencesDto(gate.userId, availableTypes);
    const globals = summarizeGlobals(preferences);

    return NextResponse.json({
      ok: true,
      global: Boolean(body.global),
      preferences,
      ...globals,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur serveur" },
      { status: 500 },
    );
  }
}
