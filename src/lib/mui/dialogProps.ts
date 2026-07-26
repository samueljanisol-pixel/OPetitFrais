import type { DialogProps } from '@mui/material/Dialog'

/** Fermeture explicite uniquement (bouton Annuler / Fermer) — pas clic backdrop ni Échap. */
export function preventBackdropDialogClose(onClose: () => void): NonNullable<DialogProps['onClose']> {
  return (_event, reason) => {
    if (reason === 'backdropClick' || reason === 'escapeKeyDown') return
    onClose()
  }
}

export const formDialogProps = {
  disableEscapeKeyDown: true,
} as const
