import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportFiles } from './export-files';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('exportFiles', () => {
  it('writes files into a new folder named after the chat', () => {
    const parent = mkdtempSync(join(tmpdir(), 'ull-export-'));
    dirs.push(parent);
    const files = [
      { path: 'index.html', content: '<p>hi</p>' },
      { path: 'src/game.js', content: 'go()' },
    ];
    const first = exportFiles(parent, 'Tennis: the game?', files);
    const second = exportFiles(parent, 'Tennis: the game?', files);

    expect(first).toBe(join(parent, 'Tennis the game'));
    expect(second).toBe(join(parent, 'Tennis the game (2)'));
    expect(readFileSync(join(first, 'src', 'game.js'), 'utf8')).toBe('go()');
    expect(readdirSync(parent).sort()).toEqual(['Tennis the game', 'Tennis the game (2)']);
  });

  it('never writes outside the folder', () => {
    const parent = mkdtempSync(join(tmpdir(), 'ull-export-'));
    dirs.push(parent);
    const folder = exportFiles(parent, 'CON', [{ path: '../escape.txt', content: 'x' }]);
    expect(folder).toBe(join(parent, 'UltimateLLM files'));
    expect(readdirSync(parent)).toEqual(['UltimateLLM files']);
    expect(readdirSync(folder)).toEqual([]);
  });
});
