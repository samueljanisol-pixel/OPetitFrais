import { requireApiPermission } from "@/lib/auth/require-permission-api";

export async function requireCommandesClientRead() {
  return requireApiPermission("commandes_client.read");
}

export async function requireCommandesClientValidate() {
  return requireApiPermission("commandes_client.validate");
}

export async function requireCommandesClientPrepare() {
  return requireApiPermission("commandes_client.prepare");
}

export async function requireCommandesClientDeliver() {
  return requireApiPermission("commandes_client.deliver");
}

/** Lecture liste / détail / catalogue (read, validate, prepare ou deliver). */
export async function requireCommandesClientReadAccess() {
  const read = await requireApiPermission("commandes_client.read");
  if (read.ok) return read;
  const validate = await requireApiPermission("commandes_client.validate");
  if (validate.ok) return validate;
  const prepare = await requireApiPermission("commandes_client.prepare");
  if (prepare.ok) return prepare;
  return requireApiPermission("commandes_client.deliver");
}

/** validate OR prepare OR deliver for mutating routes shared across roles */
export async function requireCommandesClientWrite() {
  const validate = await requireApiPermission("commandes_client.validate");
  if (validate.ok) return validate;
  const prepare = await requireApiPermission("commandes_client.prepare");
  if (prepare.ok) return prepare;
  return requireApiPermission("commandes_client.deliver");
}
