#!/usr/bin/env node
/**
 * Prints showcase.html once per built-in theme, so the six can be compared side by side.
 *
 *   node build-all.mjs
 *
 * Writes showcase-<theme>.pdf and showcase-<theme>-review/ next to this file, and exits
 * non-zero if any of the six reports an error.
 */

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, '..', '..', 'skills', 'pdf-design');
const THEMES = readdirSync(join(SKILL, 'assets', 'themes'))
  .filter(f => f.endsWith('.css'))
  .map(f => f.slice(0, -4))
  .sort();

let failed = 0;
for (const theme of THEMES) {
  const r = spawnSync(process.execPath,
    [join(SKILL, 'scripts', 'print.mjs'), join(HERE, 'showcase.html'), `--theme=${theme}`],
    { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const verdict = out.split('\n').find(l => l.startsWith('OK:') || l.startsWith('DO NOT')) || 'no report';
  console.log(`${theme.padEnd(9)} ${verdict.trim()}`);
  if (r.status !== 0) failed++;
}

console.log(`\n${THEMES.length - failed}/${THEMES.length} themes printed clean.`);
process.exit(failed ? 1 : 0);
