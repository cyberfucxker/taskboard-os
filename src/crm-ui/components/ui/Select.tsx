import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SelectOption {
  value: string;
  label: string;
  /**
   * Heading to file this option under. Options carrying the same group are rendered inside
   * one <optgroup>, in the order they arrive.
   *
   * For a list where the labels only make sense in context — pipeline stages called "Active"
   * or "Other", which several pipelines each have one of — the group is the difference
   * between a choice and a guess. Options with no group render loose, before the groups.
   */
  group?: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, label, error, hint, options, id, ...props }, ref) => {
    const selectId = id ?? props.name;

    // Loose options first — they are the placeholder and the "any" choices, which belong
    // above the headings rather than inside one of them.
    const ungrouped = options.filter((o) => !o.group);
    const groups = options.reduce<[string, SelectOption[]][]>((acc, opt) => {
      if (!opt.group) return acc;
      const existing = acc.find(([name]) => name === opt.group);
      if (existing) existing[1].push(opt);
      else acc.push([opt.group, [opt]]);
      return acc;
    }, []);

    return (
      <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'h-9 w-full appearance-none rounded-lg border bg-surface pl-3 pr-8 text-sm text-ink transition-colors focus-ring',
              error ? 'border-danger-500' : 'border-line-strong hover:border-ink-faint',
              props.disabled && 'bg-surface-muted text-ink-faint cursor-not-allowed',
              className
            )}
            {...props}
          >
            {ungrouped.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {groups.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        </div>
        {error ? <p className="text-xs text-danger-600">{error}</p> : hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      </div>
    );
  }
);
Select.displayName = 'Select';
