import { PROVIDER_NAMES, type ModelOption } from '@ultimatellm/shared';
import { Badge, Button, cn } from '@ultimatellm/ui';
import { RefreshCw } from 'lucide-react';
import { PROVIDER_LIST, PROVIDER_UI } from '../../lib/providers';
import { useCheckModelsUpdate, useModelsInfo, useSetModelsAutoUpdate } from '../../lib/queries';

const TIER_NAMES = { fast: 'Fast', balanced: 'Balanced', best: 'Best' } as const;

export function ModelsSettings() {
  const info = useModelsInfo();
  const check = useCheckModelsUpdate();
  const setAutoUpdate = useSetModelsAutoUpdate();
  if (!info.data) return null;
  const { models, registry } = info.data;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        What the manager knows about each model: price per million input/output tokens, context size
        and strengths. Models you have a working account for are marked “Ready”.
      </p>
      {PROVIDER_LIST.map((provider) => {
        const group = models.filter((model) => model.provider === provider);
        if (group.length === 0) return null;
        return (
          <section key={provider} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <span className={cn('size-2.5 rounded-full', PROVIDER_UI[provider].dotClass)} />
              {PROVIDER_NAMES[provider]}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {group.map((model) => (
                <ModelRow key={model.id} model={model} />
              ))}
            </ul>
          </section>
        );
      })}
      <footer className="flex flex-col gap-2 border-t pt-4 text-sm">
        <p className="text-muted-foreground">
          Model information from {registry.updatedAt} (
          {registry.source === 'bundled' ? 'included with the app' : 'downloaded'}).
          {registry.lastError && ` Last check failed: ${registry.lastError}`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={registry.autoUpdate}
              onChange={(event) => setAutoUpdate.mutate(event.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            Update model information automatically
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={check.isPending}
            onClick={() => check.mutate()}
          >
            <RefreshCw className={cn(check.isPending && 'animate-spin')} /> Check now
          </Button>
        </div>
      </footer>
    </div>
  );
}

function ModelRow({ model }: { model: ModelOption }) {
  return (
    <li data-testid="model-row" className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{model.name}</span>
        <Badge variant="outline">{TIER_NAMES[model.tier]}</Badge>
        {model.usable ? <Badge variant="success">Ready</Badge> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          ${model.inputPerM} / ${model.outputPerM} · {formatContext(model.contextTokens)} context
        </span>
      </div>
      {model.notes && <p className="text-xs text-muted-foreground">{model.notes}</p>}
    </li>
  );
}

function formatContext(tokens: number): string {
  return tokens >= 1_000_000
    ? `${Math.round(tokens / 100_000) / 10}M`
    : `${Math.round(tokens / 1000)}k`;
}
