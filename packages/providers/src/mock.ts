import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { BUNDLED_REGISTRY } from '@ultimatellm/registry';
import type { ProviderId } from '@ultimatellm/shared';
import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { ProviderError } from './errors';
import type { ProviderAdapter } from './types';

/**
 * A stand-in for a real provider, for development and automated tests. No
 * network calls are made and nothing is billed. Behavior is controlled by the
 * API key and the prompt:
 *
 * - key starting with `invalid`     → rejected when added
 * - key starting with `ratelimited` → accepted, but every request hits a rate limit
 * - key starting with `revoked`     → accepted, but requests fail authentication
 * - prompt containing `[slow]`      → replies stream slowly (for testing Stop)
 *
 * Planning requests (structured output named "plan") get a scripted plan that
 * uses the models the planner recommends:
 * - `[workflow]`, or "build/create/make … game/app/site" → a three-task workflow
 * - `[pick:<model-id>]` → a direct answer by that model
 * - `[badplan]` → output that doesn't match the schema
 * - anything else → a direct answer by the recommended chat model
 *
 * A task given files to write calls `write_file` for each, then reports.
 */
export function createMockAdapter(provider: ProviderId): ProviderAdapter {
  return {
    id: provider,

    validate(credential) {
      if (credential.apiKey.startsWith('invalid')) {
        return Promise.reject(new ProviderError('auth_invalid', 'Mock: this API key is invalid.'));
      }
      const models = BUNDLED_REGISTRY.forProvider(provider).map((model) => model.id);
      return Promise.resolve({ models });
    },

    languageModel: (modelId, credential) =>
      new MockLanguageModelV4({
        provider: `${provider}.mock`,
        modelId,
        doGenerate: async (options) => {
          const failure = failureFor(credential.apiKey);
          if (failure) throw failure;
          await delay(80);
          const text =
            options.responseFormat?.type === 'json' && options.responseFormat.name === 'plan'
              ? mockPlan(promptText(options.prompt), modelId)
              : replyText(provider, modelId, lastUserText(options.prompt));
          return {
            content: [{ type: 'text', text }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: usage(promptText(options.prompt), text),
            warnings: [],
          };
        },
        doStream: (options) => {
          const failure = failureFor(credential.apiKey);
          if (failure) return Promise.reject(failure);
          const all = promptText(options.prompt);
          return Promise.resolve({
            stream: simulateReadableStream({
              chunks: streamParts(provider, modelId, options),
              initialDelayInMs: 50,
              chunkDelayInMs: all.includes('[slow]') ? 250 : 10,
            }),
          });
        },
      }),

    effortOptions: () => undefined,
  };
}

function streamParts(
  provider: ProviderId,
  modelId: string,
  options: LanguageModelV4CallOptions,
): LanguageModelV4StreamPart[] {
  const userText = lastUserText(options.prompt);
  const canWrite = options.tools?.some((tool) => tool.name === 'write_file') ?? false;
  const toolResults = options.prompt.filter((message) => message.role === 'tool');
  const files = filesToWrite(userText);

  if (canWrite && files.length > 0 && toolResults.length === 0) {
    // First step of a task: write every file it was asked for.
    return [
      { type: 'stream-start', warnings: [] },
      ...files.map((path, index): LanguageModelV4StreamPart => ({
        type: 'tool-call',
        toolCallId: `mock-call-${index}`,
        toolName: 'write_file',
        input: JSON.stringify({ path, content: mockFile(path, modelId) }),
      })),
      {
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage: usage(promptText(options.prompt), files.join(' ')),
      },
    ];
  }

  const reply =
    toolResults.length > 0
      ? `Mock report from ${BUNDLED_REGISTRY.name(modelId)}: wrote ${files.length} file(s) as the spec asks.`
      : replyText(provider, modelId, userText);
  const pieces = reply.split(/(?<=\s)/);
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    ...pieces.map((delta): LanguageModelV4StreamPart => ({
      type: 'text-delta',
      id: 'text-1',
      delta,
    })),
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: usage(promptText(options.prompt), reply),
    },
  ];
}

function replyText(provider: ProviderId, modelId: string, userText: string): string {
  const workspace = /Files in the workspace:\n((?:- `[^`]+`.*\n?)+)/.exec(userText);
  if (workspace) {
    const names = [...(workspace[1] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    return (
      `**Mock wrap-up** from ${BUNDLED_REGISTRY.name(modelId)}.\n\n` +
      `The workflow produced ${names.length} file(s):\n\n` +
      names.map((name) => `- \`${name}\``).join('\n')
    );
  }
  const quoted = userText.length > 200 ? `${userText.slice(0, 197)}...` : userText;
  return (
    `**Mock reply** from ${BUNDLED_REGISTRY.name(modelId)} (${provider}).\n\n` +
    `You asked: “${quoted}”\n\n` +
    `- This answer was generated locally for testing.\n- No API calls were made.`
  );
}

/** A plan in the planner's JSON format (see `PlanDraft` in packages/core). */
function mockPlan(prompt: string, managerModel: string): string {
  if (prompt.includes('[badplan]')) return '{"kind": "direct", "summary": ';
  const recommended = parseTag<Record<string, string>>(prompt, 'recommended') ?? {};
  const pick = (category: string) => recommended[category] ?? recommended.chat ?? managerModel;
  const request = prompt.slice(prompt.lastIndexOf('Request:'));

  const pinned = /\[pick:([a-z0-9.-]+)\]/i.exec(request)?.[1];
  const wantsWorkflow =
    request.includes('[workflow]') ||
    /\b(build|create|make)\b.{0,40}\b(game|app|website|site)\b/i.test(request);

  if (!wantsWorkflow || pinned) {
    return JSON.stringify({
      kind: 'direct',
      summary: 'Answer directly',
      category: 'chat',
      model: pinned ?? pick('chat'),
      effort: 'medium',
      spec: '',
      tasks: [],
    });
  }

  const task = (
    id: string,
    title: string,
    category: string,
    outputs: string[],
    dependsOn: string[],
  ) => ({
    id,
    title,
    instructions: `${title}, following the spec.`,
    category,
    model: pick(category),
    effort: 'medium',
    dependsOn,
    outputs,
    rationale: `Recommended for ${category.replace('_', ' ')}.`,
  });
  return JSON.stringify({
    kind: 'workflow',
    summary: 'Build it in three parts: data, code and a README',
    category: 'coding',
    model: pick('coding'),
    effort: 'medium',
    spec:
      '# Mock project\n\n' +
      '- `data/players.json`: player stats, an array of `{ name, speed, power }`\n' +
      '- `index.html` and `src/game.js`: the game, reading `data/players.json`\n' +
      '- `README.md`: how to run it',
    tasks: [
      task('t1', 'Research player stats', 'data_extraction', ['data/players.json'], []),
      task('t2', 'Write the game code', 'coding', ['index.html', 'src/game.js'], ['t1']),
      task('t3', 'Write the README', 'technical_writing', ['README.md'], []),
    ],
  });
}

function mockFile(path: string, modelId: string): string {
  const by = `Written by ${BUNDLED_REGISTRY.name(modelId)} (mock).`;
  if (path.endsWith('.json')) return `${JSON.stringify({ mock: true, note: by }, null, 2)}\n`;
  if (path.endsWith('.html')) {
    return `<!doctype html>\n<title>Mock</title>\n<p>${by}</p>\n<script src="src/game.js"></script>\n`;
  }
  if (path.endsWith('.js')) return `// ${by}\nconsole.log('mock');\n`;
  return `# ${path}\n\n${by}\n`;
}

/** Paths listed under "Files to write:" in a task prompt. */
function filesToWrite(text: string): string[] {
  const section = /Files to write:\n((?:- `[^`]+`.*\n?)+)/.exec(text);
  if (!section) return [];
  return [...(section[1] ?? '').matchAll(/^- `([^`]+)`/gm)].map((match) => match[1] ?? '');
}

function parseTag<T>(text: string, tag: string): T | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return undefined;
  }
}

function failureFor(apiKey: string): APICallError | undefined {
  const fail = (statusCode: number, message: string) =>
    new APICallError({
      message,
      url: 'mock://provider',
      requestBodyValues: {},
      statusCode,
      responseBody: JSON.stringify({ error: { message } }),
      isRetryable: statusCode === 429,
    });
  if (apiKey.startsWith('ratelimited')) return fail(429, 'Mock: rate limit reached.');
  if (apiKey.startsWith('revoked')) return fail(401, 'Mock: this API key was revoked.');
  return undefined;
}

/** All text in a prompt, system message included. */
function promptText(prompt: LanguageModelV4Prompt): string {
  return prompt
    .map((message) =>
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) => (part.type === 'text' ? part.text : '')).join(' '),
    )
    .join('\n');
}

function lastUserText(prompt: LanguageModelV4Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message?.role !== 'user') continue;
    return message.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join(' ')
      .trim();
  }
  return '';
}

function usage(input: string, output: string): LanguageModelV4Usage {
  const inputTokens = Math.ceil(input.length / 4);
  const outputTokens = Math.ceil(output.length / 4);
  return {
    inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
