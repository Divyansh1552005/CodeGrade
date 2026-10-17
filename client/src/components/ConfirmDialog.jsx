import { useRef } from 'react';
import { Button, Modal } from './ui/index.js';

/**
 * Destructive-action confirmation. Replaces window.confirm so the choice is
 * themed and accessible. Focus starts on Cancel so Enter never confirms by accident.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
}) {
  const cancelRef = useRef(null);
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={title}
      busy={busy}
      onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
      footer={
        <>
          <Button ref={cancelRef} onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-base text-fg-muted">{message}</p>
    </Modal>
  );
}
