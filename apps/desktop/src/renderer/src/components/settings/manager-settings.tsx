import {
  DEFAULT_MANAGER_PRIORITY,
  MANAGER_NAMES,
  PROVIDER_NAMES,
  type ProviderId,
} from '@ultimatellm/shared';
import { Badge, Button, cn } from '@ultimatellm/ui';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { PROVIDER_UI } from '../../lib/providers';
import { useManagerStatus, useSetManagerOrder } from '../../lib/queries';

export function ManagerSettings() {
  const status = useManagerStatus();
  const setOrder = useSetManagerOrder();
  const order = status.data?.order ?? [...DEFAULT_MANAGER_PRIORITY];
  const usable = new Set(status.data?.usable ?? []);
  const configured = new Set(status.data?.configured ?? []);
  const isDefault = order.join() === DEFAULT_MANAGER_PRIORITY.join();

  const move = (index: number, offset: -1 | 1) => {
    const next = [...order];
    const [moved] = next.splice(index, 1);
    next.splice(index + offset, 0, moved!);
    setOrder.mutate(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        The manager plans each prompt and picks which models answer it. The first provider in this
        list that you have a working account for manages; if it fails, the next one takes over.
      </p>
      <ol aria-label="Manager order" className="flex flex-col gap-2">
        {order.map((provider: ProviderId, index) => (
          <li
            key={provider}
            data-testid="manager-row"
            className="flex items-center gap-3 rounded-lg border px-3 py-2"
          >
            <span className="w-4 text-sm text-muted-foreground tabular-nums">{index + 1}</span>
            <span className={cn('size-2.5 rounded-full', PROVIDER_UI[provider].dotClass)} />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">{MANAGER_NAMES[provider]}</span>{' '}
              <span className="text-xs text-muted-foreground">({PROVIDER_NAMES[provider]})</span>
            </div>
            {status.data?.manager === provider ? (
              <Badge variant="brand">Managing</Badge>
            ) : usable.has(provider) ? (
              <Badge>Backup</Badge>
            ) : configured.has(provider) ? (
              <Badge
                variant="warning"
                title="Its accounts are rate-limited, out of credit or rejected"
              >
                Paused
              </Badge>
            ) : (
              <Badge variant="outline">No account</Badge>
            )}
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${MANAGER_NAMES[provider]} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${MANAGER_NAMES[provider]} down`}
                disabled={index === order.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {!isDefault && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => setOrder.mutate([...DEFAULT_MANAGER_PRIORITY])}
        >
          Reset to default order
        </Button>
      )}
    </div>
  );
}
