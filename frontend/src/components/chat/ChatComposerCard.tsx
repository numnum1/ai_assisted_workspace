import type { ReactNode } from 'react';

export interface ChatComposerCardProps {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function ChatComposerCard({
  children,
  className = '',
  'aria-label': ariaLabel,
}: ChatComposerCardProps) {
  const cls = ['chat-composer-card', className].filter(Boolean).join(' ');
  return (
    <div className={cls} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}>
      {children}
    </div>
  );
}
