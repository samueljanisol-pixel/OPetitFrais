export const SAURUS_SCALE_UDP_PORT = 5001;

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

export function normalizeSaurusScaleIp(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function isValidSaurusScaleIp(ip: string): boolean {
  return IPV4_RE.test(ip);
}
