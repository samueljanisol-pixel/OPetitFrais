/** Clés de types de notification (extensible). */
export const NOTIFICATION_TYPE_KEYS = ["commande_fournisseur.validee"] as const;

export type NotificationTypeKey = (typeof NOTIFICATION_TYPE_KEYS)[number];

/** Permission requise pour recevoir / configurer un type de notification. */
export const NOTIFICATION_TYPE_PERMISSIONS: Record<NotificationTypeKey, string> = {
  "commande_fournisseur.validee": "commandes_fournisseur.consolidation",
};

export type CommandeValideePayload = {
  commandeId: string;
  magasinLabel: string;
  supplierLabel: string;
};

export type UserNotificationRow = {
  id: string;
  user_id: string;
  type_key: NotificationTypeKey;
  title: string;
  body: string;
  link_url: string;
  payload: CommandeValideePayload | Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreferenceRow = {
  user_id: string;
  type_key: NotificationTypeKey;
  in_app_enabled: boolean;
  push_enabled: boolean;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
};

export function isNotificationTypeKey(value: string): value is NotificationTypeKey {
  return (NOTIFICATION_TYPE_KEYS as readonly string[]).includes(value);
}

export function notificationTypesForPermissions(permissions: string[], isFullAccess: boolean): NotificationTypeKey[] {
  if (isFullAccess) return [...NOTIFICATION_TYPE_KEYS];
  return NOTIFICATION_TYPE_KEYS.filter((typeKey) => {
    const perm = NOTIFICATION_TYPE_PERMISSIONS[typeKey];
    return permissions.includes(perm);
  });
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationTypeKey,
  { in_app_enabled: boolean; push_enabled: boolean }
> = {
  "commande_fournisseur.validee": { in_app_enabled: true, push_enabled: false },
};

export const VALIDATION_LIST_URL = "/commandes-fournisseur/validation";
