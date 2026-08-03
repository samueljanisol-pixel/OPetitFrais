export type ProfileRoleRow = {
  slug?: string | null;
  name?: string | null;
  is_full_access?: boolean;
};

export function normalizeProfileRole(
  raw: ProfileRoleRow | ProfileRoleRow[] | null | undefined,
): ProfileRoleRow | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}
