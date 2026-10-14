import { cn } from '@ultimatellm/ui';
import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Model output is untrusted: react-markdown never renders raw HTML, links open
// in the default browser (only https, see the main process), and remote images
// are blocked by the Content-Security-Policy.

const components: Components = {
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-brand underline underline-offset-2"
    />
  ),
  p: ({ node: _node, ...props }) => (
    <p {...props} className="leading-7 [&:not(:first-child)]:mt-3" />
  ),
  ul: ({ node: _node, ...props }) => <ul {...props} className="mt-3 list-disc space-y-1 pl-6" />,
  ol: ({ node: _node, ...props }) => <ol {...props} className="mt-3 list-decimal space-y-1 pl-6" />,
  li: ({ node: _node, ...props }) => <li {...props} className="leading-7" />,
  h1: ({ node: _node, ...props }) => <h1 {...props} className="mt-5 text-xl font-semibold" />,
  h2: ({ node: _node, ...props }) => <h2 {...props} className="mt-5 text-lg font-semibold" />,
  h3: ({ node: _node, ...props }) => <h3 {...props} className="mt-4 font-semibold" />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote {...props} className="mt-3 border-l-2 pl-4 text-muted-foreground" />
  ),
  hr: () => <hr className="my-5" />,
  table: ({ node: _node, ...props }) => (
    <div className="mt-3 overflow-x-auto">
      <table {...props} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th {...props} className="border-b px-3 py-1.5 text-left font-semibold" />
  ),
  td: ({ node: _node, ...props }) => <td {...props} className="border-b px-3 py-1.5" />,
  pre: ({ node: _node, ...props }) => (
    <pre
      {...props}
      className="mt-3 overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-[13px] leading-6 select-text [&_code]:bg-transparent [&_code]:p-0"
    />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code
      {...props}
      className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]', className)}
    />
  ),
};

/** Renders a model's Markdown reply. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[15px] break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
