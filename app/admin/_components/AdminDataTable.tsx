'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsUpDown, Search } from 'lucide-react';
import { TableScroll } from '@/app/components/ui/TableScroll';
import { AdminEmptyState, AdminTableSkeleton } from '@/app/admin/_components/AdminUi';

export type AdminColumn<T> = {
  key: string;
  header: string;
  sortValue?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  rows: T[];
  columns: AdminColumn<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  pageSize?: number;
  minWidthClass?: string;
  skeletonCols?: number;
};

export function AdminDataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  emptyTitle = 'Aucune donnée',
  emptyDescription,
  search,
  onSearchChange,
  searchPlaceholder = 'Rechercher…',
  toolbar,
  pageSize = 12,
  minWidthClass = 'min-w-[960px]',
  skeletonCols,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [internalSearch, setInternalSearch] = useState('');
  const query = onSearchChange ? (search ?? '') : internalSearch;
  const setQuery = onSearchChange ?? setInternalSearch;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const fromSort = columns.some((col) => {
        if (!col.sortValue) return false;
        return String(col.sortValue(row) ?? '')
          .toLowerCase()
          .includes(needle);
      });
      if (fromSort) return true;
      try {
        return JSON.stringify(row).toLowerCase().includes(needle);
      } catch {
        return false;
      }
    });
  }, [columns, query, rows]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey && c.sortValue);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb), 'fr')
        : String(vb).localeCompare(String(va), 'fr');
    });
    return copy;
  }, [columns, filtered, sortDir, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string, sortable: boolean) => {
    if (!sortable) return;
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,31,61,0.04)] overflow-hidden min-w-0">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#06b6d4] focus:bg-white focus:ring-2 focus:ring-[#06b6d4]/20"
          />
        </div>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      {loading ? (
        <div className="px-4 py-5">
          <AdminTableSkeleton cols={skeletonCols ?? columns.length} rows={7} />
        </div>
      ) : sorted.length === 0 ? (
        <div className="px-4 py-8">
          <AdminEmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <>
          <TableScroll>
            <table className={`${minWidthClass} w-full text-left text-sm`}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90">
                  {columns.map((col) => {
                    const sortable = Boolean(col.sortValue);
                    return (
                      <th
                        key={col.key}
                        className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${col.headerClassName ?? ''}`}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key, true)}
                            className="inline-flex items-center gap-1 hover:text-[#0F1F3D]"
                          >
                            {col.header}
                            <ChevronsUpDown size={12} className={sortKey === col.key ? 'text-[#06b6d4]' : 'text-slate-300'} />
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={rowKey(row)} className="border-b border-slate-50 last:border-0 hover:bg-[#06b6d4]/[0.04]">
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 align-middle text-slate-700 ${col.className ?? ''}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <p>
              {sorted.length} résultat{sorted.length > 1 ? 's' : ''}
              {sorted.length > pageSize ? ` · page ${safePage + 1}/${pageCount}` : ''}
            </p>
            {pageCount > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                  aria-label="Page précédente"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                  aria-label="Page suivante"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export function AdminFilterChip(props: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`h-8 rounded-full px-3 text-[11px] font-semibold ring-1 transition ${
        props.active
          ? 'bg-[#0F1F3D] text-white ring-[#0F1F3D]'
          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {props.children}
    </button>
  );
}
