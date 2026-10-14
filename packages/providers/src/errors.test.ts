import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { classifyError, classifyHttpError, ProviderError } from './errors';

function apiError(statusCode: number | undefined, responseBody = '', headers = {}) {
  return new APICallError({
    message: 'request failed',
    url: 'https://api.example.com/v1/x',
    requestBodyValues: {},
    statusCode,
    responseBody,
    responseHeaders: headers,
    isRetryable: false,
  });
}

describe('classifyHttpError', () => {
  it('treats 401 and 403 as a credential problem', () => {
    expect(classifyHttpError(401, '').kind).toBe('auth_invalid');
    expect(classifyHttpError(403, '').kind).toBe('auth_invalid');
  });

  it('separates rate limits from exhausted credits', () => {
    expect(classifyHttpError(429, '{"error":{"message":"Rate limit reached"}}').kind).toBe(
      'rate_limited',
    );
    // OpenAI
    expect(
      classifyHttpError(429, '{"error":{"type":"insufficient_quota","message":"quota"}}').kind,
    ).toBe('quota_exhausted');
    // Anthropic reports low credit as a 400
    expect(
      classifyHttpError(
        400,
        '{"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API."}}',
      ).kind,
    ).toBe('quota_exhausted');
    expect(classifyHttpError(402, '').kind).toBe('quota_exhausted');
  });

  it('reads Retry-After for rate limits', () => {
    expect(classifyHttpError(429, '', { 'Retry-After': '7' }).details.retryAfterMs).toBe(7000);
    expect(classifyHttpError(429, '', { 'retry-after-ms': '1500' }).details.retryAfterMs).toBe(
      1500,
    );
  });

  it('recognizes unavailable models and bad requests', () => {
    expect(classifyHttpError(404, '').kind).toBe('model_unavailable');
    expect(
      classifyHttpError(400, '{"error":{"message":"The model `x` does not exist"}}').kind,
    ).toBe('model_unavailable');
    expect(classifyHttpError(400, '{"error":{"message":"messages: too long"}}').kind).toBe(
      'bad_request',
    );
  });

  it('treats 5xx and Anthropic overload (529) as server errors', () => {
    expect(classifyHttpError(500, '').kind).toBe('server_error');
    expect(classifyHttpError(529, '').kind).toBe('server_error');
  });

  it("uses the provider's message, including Gemini's array-wrapped errors", () => {
    const gemini =
      '[{"error":{"code":429,"message":"Resource has been exhausted","status":"RESOURCE_EXHAUSTED"}}]';
    expect(classifyHttpError(429, gemini).message).toBe('Resource has been exhausted');
    expect(classifyHttpError(500, 'plain text failure').message).toBe('plain text failure');
    expect(classifyHttpError(500, '').message).toBe('HTTP 500');
  });
});

describe('classifyError', () => {
  it('classifies AI SDK API errors by status', () => {
    expect(classifyError(apiError(401)).kind).toBe('auth_invalid');
    expect(classifyError(apiError(429, '', { 'retry-after': '2' })).details.retryAfterMs).toBe(
      2000,
    );
  });

  it('treats a missing status as a network failure', () => {
    expect(classifyError(apiError(undefined)).kind).toBe('network');
    expect(classifyError(new TypeError('fetch failed')).kind).toBe('network');
  });

  it('recognizes cancellation', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(classifyError(abort).kind).toBe('aborted');
  });

  it('passes ProviderErrors through and wraps everything else', () => {
    const original = new ProviderError('bad_request', 'nope');
    expect(classifyError(original)).toBe(original);
    expect(classifyError('weird').kind).toBe('unknown');
  });
});
