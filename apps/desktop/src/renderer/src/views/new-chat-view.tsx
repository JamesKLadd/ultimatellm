import { KeyRound } from 'lucide-react';
import { Composer } from '../components/composer';

export function NewChatView() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 pt-6 pb-16">
      <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight">
        What should we work on?
      </h2>
      <div
        role="status"
        className="mb-3 flex items-start gap-3 rounded-xl border border-dashed bg-muted/50 px-4 py-3 text-sm"
      >
        <KeyRound className="mt-0.5 size-4 shrink-0 text-brand" />
        <div>
          <p className="font-medium">No AI accounts connected yet</p>
          <p className="text-muted-foreground">
            Grok bot needs an xAI account to plan your prompts. Account setup is coming next.
          </p>
        </div>
      </div>
      <Composer />
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Grok bot splits your prompt into tasks and sends each one to the best model you have.
      </p>
    </div>
  );
}
