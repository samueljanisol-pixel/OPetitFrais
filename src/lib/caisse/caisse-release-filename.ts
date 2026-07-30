import { getCaisseAppVersion } from "./caisse-app-version";

export const LEGACY_CAISSE_RELEASE_INSTALLER = "OPetitFrais-Caisse-Setup.exe";

/** Nom installateur Windows avec version (ex. OPetitFrais-Caisse-Setup-0.1.4.exe). */
export function caisseReleaseInstallerFileName(version: string): string {
  return `OPetitFrais-Caisse-Setup-${version.trim()}.exe`;
}

export function caisseReleaseDownloadName(version?: string): string {
  const configured = process.env.CAISSE_RELEASE_DOWNLOAD_NAME?.trim();
  if (configured) return configured;
  return caisseReleaseInstallerFileName(version ?? getCaisseAppVersion());
}

/** Candidats installateur, du plus récent au legacy. */
export function caisseReleaseInstallerCandidates(version?: string): string[] {
  const v = version ?? getCaisseAppVersion();
  return [
    caisseReleaseInstallerFileName(v),
    LEGACY_CAISSE_RELEASE_INSTALLER,
    "OPetitFrais Caisse Setup 0.1.0.exe",
  ];
}
