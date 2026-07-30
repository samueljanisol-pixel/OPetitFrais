/**
 * Protocole Arduino Nano + HX711 (O'petit frais)
 *
 * Série : 115200 baud, lignes `\n`
 *
 * Lecture normale (toutes les ~50 ms) :
 *   `{grammes};{S|U}`
 *   - grammes : entier arrondi au 5 g (ex. 1315 = 1,315 kg)
 *   - S = poids stable (verrouillé), U = instable
 *
 * Calibration (ignorer en caisse) :
 *   `C;{units};{calibration_factor}`
 *
 * Commandes hôte → Arduino :
 *   T = tare manuelle
 *   V/R/O/E = LEDs (optionnel)
 */

export type ScaleReading = {
  weightGrams: number;
  weightKg: number;
  stable: boolean;
  raw: string;
  updatedAt: string;
};

export function parseScaleLine(line: string): ScaleReading | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("C;")) {
    return null;
  }

  const m = /^(-?\d+);([SU])$/.exec(trimmed);
  if (!m) {
    return null;
  }

  const weightGrams = Number.parseInt(m[1], 10);
  if (!Number.isFinite(weightGrams)) {
    return null;
  }

  return {
    weightGrams,
    weightKg: weightGrams / 1000,
    stable: m[2] === "S",
    raw: trimmed,
    updatedAt: new Date().toISOString(),
  };
}

export const SCALE_TARE_COMMAND = "T\n";
