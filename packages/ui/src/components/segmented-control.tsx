import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/utils';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Shown as a native tooltip. */
  description?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedControlOption<T>[];
  'aria-label': string;
  size?: 'sm' | 'default';
  className?: string;
}

/** A row of mutually exclusive options where exactly one is always selected. */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'default',
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      // Radix reports '' when the active item is clicked again; keep one option selected.
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5', className)}
      aria-label={props['aria-label']}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          title={option.description}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-md font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-3.5',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
          )}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export { SegmentedControl, type SegmentedControlOption, type SegmentedControlProps };
