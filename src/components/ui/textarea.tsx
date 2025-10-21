import * as React from 'react';
import { cn } from '@/lib/utils';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[120px] w-full rounded-xl border border-olive-200 bg-white/95 px-4 py-3 text-sm text-olive-900 shadow-sm transition-colors placeholder:text-olive-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900/80 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus-visible:ring-olive-500/40',
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = 'Textarea';
