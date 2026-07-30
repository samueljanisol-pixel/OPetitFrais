import { loadRuntimeConfig } from "./load-config";
import { isValidSaurusScaleIp, normalizeSaurusScaleIp } from "./saurus-scale/setting";
import { pingSaurusScale } from "./saurus-scale/upload-catalog";

export type PingSaurusScaleResult = {
  configured: boolean;
  ok: boolean;
};

export async function pingConfiguredSaurusScale(): Promise<PingSaurusScaleResult> {
  const config = loadRuntimeConfig();
  const ip = normalizeSaurusScaleIp(config.saurusScaleIp);
  if (!isValidSaurusScaleIp(ip)) {
    return { configured: false, ok: false };
  }
  const ok = await pingSaurusScale(ip);
  return { configured: true, ok };
}
