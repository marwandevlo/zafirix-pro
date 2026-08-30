import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

/** Constrained horizontal scroller for wide tables (UUIDs, timestamps, JSON). */
export function TableScroll({ children, className }: Props) {
  return (
    <div className={`atlas-table-scroll w-full min-w-0 max-w-full${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
