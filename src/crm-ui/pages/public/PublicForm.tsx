'use client';

import type { ReactNode } from 'react';
import { FileWarning } from 'lucide-react';
import { PublicFormRenderer } from '../../components/forms/PublicFormRenderer';
import { Skeleton } from '../../components/ui/LoadingSkeleton';
import { cn } from '../../utils/cn';
import { useAsync } from '../../hooks/useAsync';
import { getPublicForm } from '../../services/formService';

/**
 * The visitor-facing form at /f/<slug> — rendered by the Next route `src/app/f/[slug]`, outside the (app) group,
 * since the whole point is that nobody needs an account to fill it in. `?embed=1` drops the page
 * padding so the same URL works inside the embed iframe.
 */
export function PublicForm({ slug, isEmbed = false }: { slug: string; isEmbed?: boolean }) {

  const { data: form, isLoading, error } = useAsync(() => getPublicForm(slug ?? ''), [slug]);

  const shell = (children: ReactNode) => (
    <div className={cn('crm-public min-h-screen bg-surface-subtle text-ink', isEmbed ? 'p-3' : 'flex items-start justify-center px-4 py-10 sm:py-16')}>
      <div className={cn('w-full', isEmbed ? '' : 'max-w-lg')}>{children}</div>
    </div>
  );

  if (isLoading) {
    return shell(
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6 shadow-card">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error || !form) {
    return shell(
      <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center shadow-card">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-faint">
          <FileWarning size={22} />
        </span>
        <p className="text-sm font-semibold text-ink">This form is not available</p>
        <p className="max-w-sm text-sm text-ink-muted">
          The link may be incorrect, or the form has been deactivated. Please check with whoever shared it.
        </p>
      </div>
    );
  }

  return shell(
    <div className={form.layout === 'card' ? 'rounded-xl border border-line bg-surface p-6 shadow-card' : ''}>
      <PublicFormRenderer form={form} />
    </div>
  );
}
