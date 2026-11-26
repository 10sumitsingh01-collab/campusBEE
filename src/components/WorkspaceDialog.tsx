'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  variant?: 'profile';
  onClose: () => void;
  children: ReactNode;
}

export default function WorkspaceDialog({ title, variant, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={ref} aria-label={title} className={['workspace-dialog', variant].join(' ')}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      {children}
    </dialog>
  );
}
