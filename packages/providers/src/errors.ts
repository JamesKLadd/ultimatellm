import { APICallError } from 'ai';

/**
 * What went wrong with a provider request, in terms the account pool can act on
 * (see docs/04-providers-and-accounts.md).
 */
export type ErrorKind =
  /** Key revoked, wrong or not allowed: the account needs attention. */
  | 'auth_invalid'
  /** Short-term limit: retry later or use another account. */
  | 'rate_limited'
  /** Credits, billing or plan allowance used up. */
  | 'quota_exhausted'
  /** The model doesn't exist or isn't available to this account. */
  | 'model_unavailable'
  /** Our request was wrong (or blocked by content policy). Don't retry elsewhere. */
  | 'bad_request'
  /** The provider had a problem; another try may work. */
  | 'server_error'
  /** Couldn't reach the provider. */
  | 'network'
  /** Cancelled by the user. */
  | 'aborted'
  | 'unknown';

export class ProviderError extends Error {
  override readonly name = 'ProviderError';

  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly details: { statusCode?: number; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: details.cause });
  }
}

const QUOTA_PATTERN =
  /insufficient_quota|credit balance|billing|exceeded your current quota|payment required|spending limit|out of credits/i;
const MODEL_PATTERN =
  /model.{0,60}(not found|does not exist|not supported|unavailable|not available|do not have access)|unknown model|invalid model/i;

/** Turns an HTTP error response from a provider into a `ProviderError`. */
export function classifyHttpError(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {},
  cause?: unknown,
): ProviderError {
  const message = providerMessage(body) ?? `HTTP ${statusCode}`;
  const details = { statusCode, cause };

  if (statusCode === 401 || statusCode === 403)
    return new ProviderError('auth_invalid', message, details);
  if (statusCode === 402) return new ProviderError('quota_exhausted', message, details);
  if (statusCode === 404) return new ProviderError('model_unavailable', message, details);
  if (statusCode === 429) {
    if (QUOTA_PATTERN.test(body)) return new ProviderError('quota_exhausted', message, details);
    return new ProviderError('rate_limited', message, {
      ...details,
      retryAfterMs: retryAfterMs(headers),
    });
  }
  if (statusCode === 400 || statusCode === 422) {
    if (QUOTA_PATTERN.test(body)) return new ProviderError('quota_exhausted', message, details);
    if (MODEL_PATTERN.test(body)) return new ProviderError('model_unavailable', message, details);
    return new ProviderError('bad_request', message, details);
  }
  if (statusCode === 408 || statusCode >= 500) {
    return new ProviderError('server_error', message, details);
  }
  return new ProviderError('unknown', message, details);
}

/** Classifies anything thrown while calling a provider. */
export function classifyError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (isAbortError(error)) return new ProviderError('aborted', 'Cancelled', { cause: error });

  if (APICallError.isInstance(error)) {
    if (error.statusCode === undefined) {
      return new ProviderError('network', "Couldn't reach the provider.", { cause: error });
    }
    return classifyHttpError(
      error.statusCode,
      error.responseBody ?? error.message,
      error.responseHeaders ?? {},
      error,
    );
  }

  if (error instanceof TypeError && /fetch failed|network/i.test(error.message)) {
    return new ProviderError('network', "Couldn't reach the provider.", { cause: error });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ProviderError('unknown', message, { cause: error });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/** Pulls the human-readable message out of a provider's JSON error body. */
function providerMessage(body: string): string | undefined {
  let text = body.trim();
  try {
    const parsed: unknown = JSON.parse(body);
    const found = findMessage(parsed);
    if (found) text = found;
  } catch {
    // Not JSON: use the raw text.
  }
  if (!text) return undefined;
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

function findMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (typeof record.error === 'string') return record.error;
  if (Array.isArray(value)) return findMessage(value[0]);
  return findMessage(record.error);
}

function retryAfterMs(headers: Record<string, string>): number | undefined {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const ms = Number(lower['retry-after-ms']);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const seconds = Number(lower['retry-after']);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return undefined;
}
