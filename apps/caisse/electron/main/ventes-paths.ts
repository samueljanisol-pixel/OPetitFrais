import { join } from "path";
import { app } from "electron";
import { ventesDirCaisse, ventesDirMagasin } from "../../shared/caisse-identity";

export function ventesUserDataRoot(): string {
  try {
    return join(app.getPath("userData"), "ventes");
  } catch {
    return join(process.cwd(), "ventes");
  }
}

export function ventesLocalDir(magasinCode: string, caisseCode: string): string {
  return join(ventesUserDataRoot(), ventesDirMagasin(magasinCode), ventesDirCaisse(caisseCode));
}
