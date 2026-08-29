import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

/** Constrained horizontal scroller for wide tables (UUIDs, timestamps, JSON). */
export function TableScroll({ children, className }: Props) {
  return (
    <div className={`atlas-table-scroll${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
