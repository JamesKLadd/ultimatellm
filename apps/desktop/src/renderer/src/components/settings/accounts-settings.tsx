import { PROVIDER_NAMES, type AccountSummary, type ProviderId } from '@ultimatellm/shared';
import { Badge, Button, cn, Input } from '@ultimatellm/ui';
import { ArrowDown, ArrowUp, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, formatTime, PROVIDER_LIST, PROVIDER_UI } from '../../lib/providers';
import {
  useAccounts,
  useAddAccount,
  useManagerStatus,
  useRecheckAccount,
  useRemoveAccount,
  useReorderAccounts,
} from '../../lib/queries';

export function AccountsSettings() {
  const accounts = useAccounts();
  const manager = useManagerStatus();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Add API keys for the providers you use. Keys are encrypted with your system keychain and
        only ever sent to their own provider. With several keys for one provider, the first one is
        used until it hits a limit.
      </p>
      {PROVIDER_LIST.map((provider) => (
        <ProviderSection
          key={provider}
          provider={provider}
          accounts={accounts.data?.filter((account) => account.provider === provider) ?? []}
          isManager={manager.data?.manager === provider}
        />
      ))}
    </div>
  );
}

interface ProviderSectionProps {
  provider: ProviderId;
  accounts: AccountSummary[];
  isManager: boolean;
}

function ProviderSection({ provider, accounts, isManager }: ProviderSectionProps) {
  const ui = PROVIDER_UI[provider];
  const reorder = useReorderAccounts();

  const move = (index: number, offset: -1 | 1) => {
    const ids = accounts.map((account) => account.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved!);
    reorder.mutate({ provider, ids });
  };

  return (
    <section aria-label={`${PROVIDER_NAMES[provider]} accounts`} className="rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <span className={cn('size-2.5 rounded-full', ui.dotClass)} />
        <h3 className="font-semibold">{PROVIDER_NAMES[provider]}</h3>
        {isManager && <Badge variant="brand">Manager</Badge>}
        <a
          href={ui.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&_svg]:size-3"
        >
          Get a key <ExternalLink />
        </a>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{ui.help}</p>

      {accounts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {accounts.map((account, index) => (
            <AccountRow
              key={account.id}
              account={account}
              onMoveUp={index > 0 ? () => move(index, -1) : undefined}
              onMoveDown={index < accounts.length - 1 ? () => move(index, 1) : undefined}
            />
          ))}
        </ul>
      )}
      <AddKeyForm provider={provider} />
    </section>
  );
}

function StatusBadge({ account }: { account: AccountSummary }) {
  const until = account.unavailableUntil ? ` until ${formatTime(account.unavailableUntil)}` : '';
  switch (account.status) {
    case 'active':
      return <Badge variant="success">Active</Badge>;
    case 'rate_limited':
      return <Badge variant="warning">Rate limited{until}</Badge>;
    case 'quota_exhausted':
      return <Badge variant="warning">Out of credit{until}</Badge>;
    case 'auth_invalid':
      return <Badge variant="destructive">Key rejected</Badge>;
  }
}

interface AccountRowProps {
  account: AccountSummary;
  onMoveUp: (() => void) | undefined;
  onMoveDown: (() => void) | undefined;
}

function AccountRow({ account, onMoveUp, onMoveDown }: AccountRowProps) {
  const remove = useRemoveAccount();
  const recheck = useRecheckAccount();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <li
      data-testid="account-row"
      className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{account.label}</span>
          <span className="font-mono text-xs text-muted-foreground">{account.keyHint}</span>
          <StatusBadge account={account} />
        </div>
        {account.lastError && account.status !== 'active' && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={account.lastError}>
            {account.lastError}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {account.status !== 'active' && (
          <Button
            size="sm"
            variant="outline"
            disabled={recheck.isPending}
            onClick={() => recheck.mutate(account.id)}
          >
            <RefreshCw className={cn(recheck.isPending && 'animate-spin')} /> Check again
          </Button>
        )}
        {onMoveUp && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Move ${account.label} up`}
            onClick={onMoveUp}
          >
            <ArrowUp />
          </Button>
        )}
        {onMoveDown && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Move ${account.label} down`}
            onClick={onMoveDown}
          >
            <ArrowDown />
          </Button>
        )}
        <Button
          size={confirming ? 'sm' : 'icon-sm'}
          variant={confirming ? 'destructive' : 'ghost'}
          aria-label={confirming ? `Confirm removing ${account.label}` : `Remove ${account.label}`}
          onClick={() => (confirming ? remove.mutate(account.id) : setConfirming(true))}
        >
          <Trash2 />
          {confirming && 'Remove?'}
        </Button>
      </div>
    </li>
  );
}

function AddKeyForm({ provider }: { provider: ProviderId }) {
  const add = useAddAccount();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const providerName = PROVIDER_NAMES[provider];

  const close = () => {
    setOpen(false);
    setLabel('');
    setApiKey('');
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await add.mutateAsync({
        provider,
        apiKey,
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      if (result.ok) close();
      else setError(result.error);
    } catch (addError) {
      setError(errorMessage(addError));
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)}>
        <Plus /> Add {providerName} API key
      </Button>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label={`Add ${providerName} API key`}
      className="mt-3 flex flex-col gap-2 rounded-lg bg-muted/50 p-3"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <Input
          aria-label="Label (optional)"
          placeholder="Label (optional)"
          value={label}
          maxLength={60}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Input
          aria-label="API key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={PROVIDER_UI[provider].keyPlaceholder}
          value={apiKey}
          autoFocus
          aria-invalid={error ? true : undefined}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={apiKey.trim().length < 8 || add.isPending}>
          {add.isPending ? 'Checking key…' : 'Save key'}
        </Button>
      </div>
    </form>
  );
}
