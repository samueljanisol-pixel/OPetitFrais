'use client'

import Dialog, { type DialogProps } from '@mui/material/Dialog'
import { preventBackdropDialogClose } from './dialogProps'

export type FormDialogProps = Omit<DialogProps, 'onClose'> & {
  onClose: () => void
}

/** Dialogue avec saisie — ne se ferme pas au clic extérieur ni avec Échap. */
export default function FormDialog({ onClose, ...props }: FormDialogProps) {
  return <Dialog {...props} onClose={preventBackdropDialogClose(onClose)} />
}
