/**
 * Fait apparaître le pavé numérique sur mobile (iOS / Android) pour les champs saisis en nombre.
 * MUI 9 : attributs natifs sur l’`input` via `slotProps.htmlInput`.
 */
export const muiSlotPropsDecimalKeypad = {
  htmlInput: { inputMode: 'decimal' as const },
} as const

export const muiSlotPropsIntegerKeypad = {
  htmlInput: { inputMode: 'numeric' as const },
} as const
