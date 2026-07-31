export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Arrondi au 0,5 DH le plus proche (total panier caisse). */
export function roundMoneyHalf(value: number): number {
  return Math.round(roundMoney(value) * 2) / 2;
}

/** Retire les zéros inutiles après la virgule (12,50 → 12,5 ; 12,00 → 12). */
export function trimTrailingZerosFr(formatted: string): string {
  if (!formatted.includes(",")) return formatted;
  return formatted.replace(/(,\d*?[1-9])0+$/, "$1").replace(/,0+$/, "");
}

export function formatDecimalFr(value: number, maxDecimals: number): string {
  return trimTrailingZerosFr(value.toFixed(maxDecimals).replace(".", ","));
}

export function formatMoneyFr(value: number): string {
  return formatDecimalFr(value, 2);
}

/** Montant avec toujours 2 décimales (12 → 12,00 ; 12,5 → 12,50). */
export function formatMoneyFrFixed(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function formatMoneyDh(value: number): string {
  return `${formatMoneyFr(value)} DH`;
}

export function formatMoneyDhFixed(value: number): string {
  return `${formatMoneyFrFixed(value)} DH`;
}

export function formatWeightKgFr(value: number): string {
  const decimals = Math.abs(value) >= 10 ? 2 : 3;
  return formatDecimalFr(value, decimals);
}

/** Affichage balance : 2 dec. si < 0, 3 dec. entre 0 et 10 kg, 2 dec. >= 10 kg. */
export function formatBalanceWeightKgFr(value: number): string {
  const decimals = value < 0 ? 2 : value < 10 ? 3 : 2;
  return formatDecimalFr(value, decimals);
}

/** Balance avec décimales fixes (0,000 / 0,00 selon la plage). */
export function formatBalanceWeightKgFrFixed(value: number): string {
  const decimals = value < 0 ? 2 : value < 10 ? 3 : 2;
  return value.toFixed(decimals).replace(".", ",");
}
