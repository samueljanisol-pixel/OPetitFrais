/** Autorise la fermeture sans confirmation (menu confirmé, MAJ, etc.). */
let allowAppQuit = false;

export function markQuitAllowed(): void {
  allowAppQuit = true;
}

export function shouldPreventWindowClose(): boolean {
  return !allowAppQuit;
}
