'use client';

import type React from 'react';

export function AdminAlert(props: { variant: 'info' | 'warning' | 'error'; children: React.ReactNode }) {
  const cls =
    props.variant === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : props.variant === 'warning'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-blue-50 border-blue-200 text-blue-800';
  return <div className={`rounded-xl border p-4 text-sm ${cls}`}>{props.children}</div>;
}

export function AdminSection(props: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-w-0">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">{props.title}</p>
          {props.subtitle ? <p className="text-xs text-gray-500 mt-0.5">{props.subtitle}</p> : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="px-6 py-6">{props.children}</div>
    </div>
  );
}

export function AdminEmptyState(props: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-10 text-center">
      <p className="text-sm font-semibold text-gray-900">{props.title}</p>
      {props.description ? <p className="text-sm text-gray-600 mt-2">{props.description}</p> : null}
    </div>
  );
}

export function AdminTableSkeleton(props: { cols: number; rows?: number }) {
  const rows = props.rows ?? 6;
  return (
    <div className="atlas-table-scroll">
      <div className="min-w-[980px]">
        <div className="bg-gray-50 border-b border-gray-100 grid" style={{ gridTemplateColumns: `repeat(${props.cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: props.cols }).map((_, i) => (
            <div key={i} className="px-6 py-4">
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="border-b border-gray-100 grid"
            style={{ gridTemplateColumns: `repeat(${props.cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: props.cols }).map((__, c) => (
              <div key={c} className="px-6 py-4">
                <div className={`h-3 bg-gray-200 rounded animate-pulse ${c === 0 ? 'w-56' : 'w-28'}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

