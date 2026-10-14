import { MANAGER_NAMES } from '@ultimatellm/shared';
import { Button } from '@ultimatellm/ui';
import { KeyRound } from 'lucide-react';
import { Composer } from '../components/composer';
import { useManagerStatus } from '../lib/queries';
import { useUiStore } from '../state/ui-store';

export function NewChatView() {
  const manager = useManagerStatus();
  const openSettings = useUiStore((state) => state.openSettings);
  const current = manager.data?.manager ?? null;

  return (
    <div className="flex h-full overflow-y-auto">
      <div className="m-auto flex w-full max-w-3xl flex-col px-6 pt-6 pb-16">
        <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight">
          What should we work on?
        </h2>
        {manager.data && current === null && (
          <div
            role="status"
            className="mb-3 flex items-start gap-3 rounded-xl border border-dashed bg-muted/50 px-4 py-3 text-sm"
          >
            <KeyRound className="mt-0.5 size-4 shrink-0 text-brand" />
            <div className="flex-1">
              <p className="font-medium">No AI accounts connected yet</p>
              <p className="text-muted-foreground">
                Add an API key from xAI, Anthropic, OpenAI or Google. The first one you have, in the
                order Grok, Claude, ChatGPT, Gemini, becomes the manager that plans your prompts. A
                free Google AI Studio key is enough to try it out.
              </p>
            </div>
            <Button size="sm" onClick={() => openSettings('accounts')}>
              Add an account
            </Button>
          </div>
        )}
        <Composer autoFocus />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {current ? (
            <>
              <button
                type="button"
                onClick={() => openSettings('manager')}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {MANAGER_NAMES[current]}
              </button>{' '}
              is managing. It picks the best model you have for each prompt.
            </>
          ) : (
            'The manager splits your prompt into tasks and sends each one to the best model you have.'
          )}
        </p>
      </div>
    </div>
  );
}
