import type * as React from 'react';
import { cn } from '../lib/utils';

/** A textarea that grows with its content (up to `max-h-*` if one is set). */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-16 w-full resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
