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
            Revenue console
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
    <div className="animate-fade-up overflow-hidden rounded-lg border border-red-200/90 bg-red-50/90 shadow-panel dark:border-red-900 dark:bg-red-950/40">
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
    <div className="animate-fade-in overflow-hidden rounded-lg border border-dashed border-border/90 bg-card/60 px-4 py-12 text-center shadow-panel sm:px-6 sm:py-14">
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
      <div className="h-11 rounded-lg skeleton" />
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-panel">
        <div className="h-10 border-b border-border skeleton opacity-70" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 border-b border-border/60 last:border-0 skeleton opacity-50" />
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

export function DataTable({
  columns,
  rows,
  empty = 'No records found. Create a record or adjust your search.',
  searchable = true,
  searchPlaceholder = 'Search records…',
  pageSizeOptions = [10, 25, 50, 100],
  defaultPageSize = 10,
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  empty?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
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

  if (rows.length === 0) {
    return <EmptyState title="No records found" description={empty} />;
  }

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-card/80 p-3 shadow-panel backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
        {searchable ? (
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 border-border/80 bg-background/80 pl-9"
              aria-label="Search table"
            />
          </div>
        ) : (
          <div />
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {filtered.length === 0
              ? 'No matches'
              : `Showing ${from}–${to} of ${filtered.length}${query.trim() ? ` (filtered from ${rows.length})` : ''}`}
          </span>
          <label className="flex items-center gap-1.5">
            <span className="whitespace-nowrap">Rows</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
        <EmptyState title="No matching records" description="Try a different search term." />
      ) : (
        <div className="-mx-3 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:px-0">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden rounded-lg border border-border/90 bg-card shadow-panel">
              <div className="h-0.5 w-full bg-gradient-to-r from-navy via-brass to-accent" />
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-gradient-to-r from-muted/80 via-muted/50 to-muted/30">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={cn(
                          'whitespace-nowrap px-3 py-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:px-4',
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
                      className="border-b border-border/70 transition-colors duration-200 last:border-0 hover:bg-accent/[0.04]"
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            'max-w-[16rem] break-words px-3 py-3 align-middle sm:max-w-none sm:px-4',
                            col.className,
                          )}
                        >
                          {row[col.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground tabular-nums">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="gap-1"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
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
