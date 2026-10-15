import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

/** The largest file a model may write. */
export const MAX_FILE_BYTES = 512 * 1024;
/** The most files a chat's workspace may hold. */
export const MAX_FILES = 200;
/** Longer files are cut when a model reads them, to protect its context window. */
const MAX_READ_CHARS = 200_000;

/**
 * Normalizes a workspace path ("./src\\game.js" → "src/game.js"), or returns
 * null if it isn't a safe relative path. Workspace paths never touch the real
 * file system, but they become file names when the user exports them.
 */
export function normalizePath(path: string): string | null {
  const parts = path
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.');
  if (parts.length === 0 || parts.length > 12) return null;
  for (const part of parts) {
    if (part.length > 100 || /^\.+$/.test(part)) return null;
    if (!/^[A-Za-z0-9 ._()@+-]+$/.test(part) || part.endsWith(' ') || part.endsWith('.')) {
      return null;
    }
  }
  const normalized = parts.join('/');
  return normalized.length <= 300 ? normalized : null;
}

const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  jsx: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  svg: 'image/svg+xml',
  csv: 'text/csv',
  xml: 'application/xml',
  py: 'text/x-python',
  yml: 'text/yaml',
  yaml: 'text/yaml',
};

export function mimeFor(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[extension] ?? 'text/plain';
}

/** What the workspace tools can do; the engine binds it to a chat and a step. */
export interface WorkspaceAccess {
  list(): { path: string; size: number }[];
  read(path: string): string | undefined;
  write(path: string, content: string): void;
}

export interface WorkspaceToolOptions {
  /** Paths other tasks of the same workflow are writing, with the task's title. */
  ownedByOthers?: ReadonlyMap<string, string>;
}

/** `list_files`, `read_file` and `write_file` over a chat's workspace. */
export function workspaceTools(
  workspace: WorkspaceAccess,
  options: WorkspaceToolOptions = {},
): ToolSet {
  return {
    list_files: tool({
      description: 'List the files in the workspace, with their sizes in bytes.',
      inputSchema: z.object({}),
      execute: () => {
        const files = workspace.list();
        return Promise.resolve(
          files.length === 0
            ? 'The workspace is empty.'
            : files.map((file) => `${file.path} (${file.size} bytes)`).join('\n'),
        );
      },
    }),

    read_file: tool({
      description: 'Read a file from the workspace.',
      inputSchema: z.object({ path: z.string().describe('Relative path, e.g. "src/game.js"') }),
      execute: ({ path }) => {
        const normalized = normalizePath(path);
        const content = normalized ? workspace.read(normalized) : undefined;
        if (content === undefined) throw new Error(`There is no file at "${path}".`);
        return Promise.resolve(
          content.length > MAX_READ_CHARS
            ? `${content.slice(0, MAX_READ_CHARS)}\n[… cut: the file has ${content.length} characters]`
            : content,
        );
      },
    }),

    write_file: tool({
      description:
        'Create or replace a file in the workspace. Always write the complete file content.',
      inputSchema: z.object({
        path: z.string().describe('Relative path from the spec, e.g. "src/game.js"'),
        content: z.string().describe('The complete file content'),
      }),
      execute: ({ path, content }) => {
        const normalized = normalizePath(path);
        if (!normalized) {
          throw new Error(
            `"${path}" isn't a valid path. Use a relative path with letters, digits, dots, dashes and slashes.`,
          );
        }
        const owner = options.ownedByOthers?.get(normalized);
        if (owner) throw new Error(`"${normalized}" belongs to another task ("${owner}").`);
        const bytes = new TextEncoder().encode(content).byteLength;
        if (bytes > MAX_FILE_BYTES) {
          throw new Error(
            `The file is too large (${bytes} bytes; the limit is ${MAX_FILE_BYTES}).`,
          );
        }
        const existing = workspace.list();
        if (existing.length >= MAX_FILES && !existing.some((file) => file.path === normalized)) {
          throw new Error(`The workspace already has ${MAX_FILES} files, the most it can hold.`);
        }
        workspace.write(normalized, content);
        return Promise.resolve(`Saved ${normalized} (${bytes} bytes).`);
      },
    }),
  };
}
