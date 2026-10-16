import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Native modal supplies a focus trap and makes the game behind it inert. */
export function RaceModal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    if (document.pointerLockElement) document.exitPointerLock();
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, []);
  return createPortal(
    <dialog ref={dialog} className="race-modal" aria-label={label} onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}
      onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="race-setup">{children}</section>
    </dialog>, document.body,
  );
}
