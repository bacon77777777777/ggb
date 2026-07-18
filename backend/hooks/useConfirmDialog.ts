import { useState } from 'react'

interface ConfirmOptions {
  title: string
  message: string
  type?: 'danger' | 'warning' | 'info'
  confirmText?: string
  onConfirm: () => void
}

interface DialogState extends ConfirmOptions {
  open: boolean
}

export function useConfirmDialog() {
  const [state, setState] = useState<DialogState | null>(null)

  const confirm = (opts: ConfirmOptions) => setState({ ...opts, open: true })
  const close = () => setState(null)

  const dialogProps = state
    ? {
        isOpen: state.open,
        onClose: close,
        onConfirm: () => { state.onConfirm(); close() },
        title: state.title,
        message: state.message,
        type: state.type ?? ('danger' as const),
        confirmText: state.confirmText,
      }
    : null

  return { confirm, dialogProps }
}
