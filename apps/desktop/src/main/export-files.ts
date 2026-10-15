import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Writes a chat's files into a new folder inside `parent`, named after the
 * chat ("Tennis game", then "Tennis game (2)", …). Returns the folder.
 */
export function exportFiles(
  parent: string,
  name: string,
  files: readonly { path: string; content: string }[],
): string {
  const base = safeName(name);
  let folder = join(parent, base);
  for (let n = 2; existsSync(folder); n++) folder = join(parent, `${base} (${n})`);
  const root = resolve(folder);
  for (const file of files) {
    const target = resolve(root, ...file.path.split('/'));
    // Workspace paths are already checked; this guards against anything that slipped through.
    const inside = relative(root, target);
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  mkdirSync(root, { recursive: true });
  return root;
}

/** A folder name that is valid on Windows, macOS and Linux. */
function safeName(name: string): string {
  const cleaned = [...name]
    .map((char) => (char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 60);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned) || !cleaned
    ? 'UltimateLLM files'
    : cleaned;
}
