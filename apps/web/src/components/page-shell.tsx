'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Inbox, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type DataTableColumn = {
  key: string;
  label: string;
  className?: string;
  /** Cell / header text alignment */
  align?: 'left' | 'right' | 'center';
  /** Sticky edge for overflow tables (use on primary id or actions) */
  sticky?: 'left' | 'right';
  /** Prefer monospace tabular feel for codes / refs */
  mono?: boolean;
  /** Hint for primary identifier column */
  primary?: boolean;
};

export type DataTableRow = Record<string, React.ReactNode> & {
  /** Optional stable row id */
  __id?: string;
  /** Optional full-text search blob (recommended when cells are React nodes) */
  __search?: string;
};

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 animate-fade-up sm:mb-7 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2.5 flex items-center gap-2">
          <div className="h-0.5 w-10 rounded-full bg-gradient-to-r from-brass via-brass-soft to-accent" />
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
            NGRS · Revenue console
          </span>
        </div>
        <h1 className="text-2xl text-navy dark:text-foreground sm:text-[1.85rem]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="animate-fade-up overflow-hidden rounded-xl border border-red-200/90 bg-red-50/90 shadow-panel dark:border-red-900 dark:bg-red-950/40">
      <div className="h-0.5 w-full bg-gradient-to-r from-red-600 to-red-400" />
      <div className="px-4 py-3.5 text-sm text-red-800 dark:text-red-200">
        <p className="break-words font-medium">Something went wrong</p>
        <p className="mt-1 break-words text-red-700/90 dark:text-red-300/90">{message}</p>
        {onRetry ? (
          <button
            type="button"
            className="mt-2.5 text-sm font-medium underline underline-offset-2"
            onClick={onRetry}
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title = 'No records yet',
  description = 'Seed the database or create a new record to get started.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="animate-fade-in overflow-hidden rounded-xl border border-dashed border-border/90 bg-card/70 px-4 py-14 text-center shadow-panel sm:px-6">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-navy/5 text-navy dark:bg-accent/15 dark:text-accent-200">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="font-serif text-lg text-navy dark:text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function LoadingState({ label = 'Loading records…' }: { label?: string }) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="overflow-hidden rounded-xl border border-border/90 bg-card shadow-panel">
        <div className="h-0.5 w-full bg-gradient-to-r from-navy via-brass to-accent opacity-40" />
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3.5">
          <div className="h-10 w-full max-w-xs rounded-lg skeleton" />
          <div className="hidden h-4 w-28 rounded skeleton sm:block" />
        </div>
        <div className="h-11 border-b border-border skeleton opacity-60" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-[3.25rem] border-b border-border/50 last:border-0 skeleton opacity-40"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function rowSearchBlob(row: DataTableRow): string {
  if (typeof row.__search === 'string' && row.__search.trim()) {
    return row.__search.toLowerCase();
  }
  return Object.entries(row)
    .filter(([key, value]) => !key.startsWith('__') && (typeof value === 'string' || typeof value === 'number'))
    .map(([, value]) => String(value))
    .join(' ')
    .toLowerCase();
}

function alignClass(align?: 'left' | 'right' | 'center') {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function stickyClass(sticky?: 'left' | 'right') {
  if (sticky === 'left') {
    return 'sticky-col sticky left-0 z-[1] bg-card group-hover:bg-[#F3F8F5] dark:group-hover:bg-accent/10';
  }
  if (sticky === 'right') {
    return 'sticky-col sticky right-0 z-[1] bg-card shadow-[-10px_0_16px_-14px_rgba(8,26,48,0.22)] group-hover:bg-[#F3F8F5] dark:group-hover:bg-accent/10';
  }
  return undefined;
}

function pageWindow(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function DataTable({
  columns,
  rows,
  empty = 'No records found. Create a record or adjust your search.',
  searchable = true,
  searchPlaceholder = 'Search records…',
  pageSizeOptions = [10, 25, 50, 100],
  defaultPageSize = 10,
  density = 'comfortable',
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  empty?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  density?: 'comfortable' | 'compact';
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => rowSearchBlob(row).includes(q));
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, rows.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const from = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filtered.length);
  const cellPad = density === 'compact' ? 'px-3 py-2.5 sm:px-3.5' : 'px-3.5 py-3.5 sm:px-4';

  if (rows.length === 0) {
    return <EmptyState title="No records found" description={empty} />;
  }

  return (
    <div className="data-table animate-fade-up overflow-hidden rounded-xl border border-border/90 bg-card shadow-panel">
      <div className="h-0.5 w-full bg-gradient-to-r from-navy via-brass to-accent" />

      <div className="flex flex-col gap-3 border-b border-border/80 bg-gradient-to-r from-navy/[0.03] via-card to-accent/[0.03] px-3.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        {searchable ? (
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 border-border/70 bg-background/90 pl-9 shadow-sm focus-visible:ring-accent/30"
              aria-label="Search table"
            />
          </div>
        ) : (
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Register
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/70 px-2.5 py-1.5 tabular-nums">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {filtered.length === 0
              ? 'No matches'
              : (
                <>
                  <span className="font-medium text-foreground">
                    {from}–{to}
                  </span>
                  <span>of {filtered.length}</span>
                  {query.trim() ? <span className="text-muted-foreground/80">· filtered {rows.length}</span> : null}
                </>
              )}
          </span>
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[11px] uppercase tracking-[0.12em]">Rows</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground shadow-sm"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-10">
          <EmptyState title="No matching records" description="Try a different search term." />
        </div>
      ) : (
        <>
          <div className="relative overflow-x-auto overscroll-x-contain">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn(
                        'sticky top-0 z-[2] whitespace-nowrap border-b border-border/90 bg-[#F3F6FA] dark:bg-navy-800',
                        cellPad,
                        'text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground',
                        alignClass(col.align),
                        col.sticky === 'left' && 'sticky left-0 z-[3] shadow-[4px_0_12px_-8px_rgba(8,26,48,0.18)]',
                        col.sticky === 'right' && 'sticky right-0 z-[3] shadow-[-4px_0_12px_-8px_rgba(8,26,48,0.18)]',
                        col.className,
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => (
                  <tr
                    key={row.__id ?? idx}
                    className="group border-b border-border/60 transition-colors duration-200 last:border-0 odd:bg-[#FBFCFD] hover:bg-[#F3F8F5] dark:odd:bg-white/[0.02] dark:hover:bg-accent/[0.08]"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          cellPad,
                          'align-middle',
                          alignClass(col.align),
                          stickyClass(col.sticky),
                          col.mono && 'font-mono text-[13px] tracking-tight',
                          col.primary && 'font-medium text-navy dark:text-foreground',
                          col.key === 'actions' && 'whitespace-nowrap',
                          col.className,
                        )}
                      >
                        <div
                          className={cn(
                            'min-w-0',
                            col.align === 'right' && 'flex justify-end',
                            col.align === 'center' && 'flex justify-center',
                            col.key === 'actions' && 'flex justify-end',
                          )}
                        >
                          {row[col.key]}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/80 bg-muted/20 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <p className="text-xs text-muted-foreground tabular-nums">
              Page <span className="font-medium text-foreground">{page}</span> of {totalPages}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 gap-1 bg-background"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </Button>
              {pageWindow(page, totalPages).map((item, i) =>
                item === 'ellipsis' ? (
                  <span key={`e-${i}`} className="px-1 text-xs text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={item === page ? 'secondary' : 'outline'}
                    onClick={() => setPage(item)}
                    className={cn(
                      'h-8 min-w-8 px-2 tabular-nums',
                      item === page ? 'bg-navy text-white hover:bg-navy-600' : 'bg-background',
                    )}
                  >
                    {item}
                  </Button>
                ),
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 gap-1 bg-background"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Compact nested register used inside detail panels */
export function MiniTable({
  headers,
  rows,
  empty = 'No rows yet',
}: {
  headers: { label: string; className?: string }[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/90 bg-card shadow-sm">
      <div className="h-px w-full bg-gradient-to-r from-navy/40 via-brass to-accent/50" />
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border/80 bg-[#F3F6FA] dark:bg-navy-800">
              {headers.map((h) => (
                <th
                  key={h.label}
                  className={cn(
                    'px-3.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground',
                    h.className,
                  )}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-3.5 py-8 text-center text-sm text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((cells, idx) => (
                <tr
                  key={idx}
                  className="border-b border-border/60 last:border-0 odd:bg-[#FBFCFD] hover:bg-[#F3F8F5] dark:odd:bg-white/[0.02]"
                >
                  {cells.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2.5 align-middle">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-foreground/90">
      {children}
    </label>
  );
}
