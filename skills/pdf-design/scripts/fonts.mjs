#!/usr/bin/env node
/**
 * pdf-design / fonts.mjs
 *
 * Downloads a Google Fonts family into ../assets/fonts/ and writes its CSS with local paths,
 * plus the font's licence. Done ONCE per family; a theme imports the CSS and print.mjs
 * embeds it in the PDF. No npm: Node 18+ ships fetch.
 *
 * Usage (the spec is the same as in a Google Fonts css2 URL):
 *   node fonts.mjs "Fraunces:ital,opsz,wght@0,9..144,300..800;1,9..144,300..800"
 *   node fonts.mjs "Geist:wght@300..800" "Instrument Serif:ital@0;1"
 *
 * Writes to assets/fonts/:
 *   <family>.css                                  the @font-face rules, font-display: block
 *   <family>-<style>-<weight>-<subset>.woff2      latin and latin-ext only
 *   licenses/<family>-OFL.txt                     when the family is OFL on github.com/google/fonts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');
// With a modern browser user agent Google serves woff2 (variable when you ask for weight ranges).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const SUBSETS = ['latin', 'latin-ext'];

const specs = process.argv.slice(2);
if (!specs.length) {
  console.error('Usage: node fonts.mjs "Family:axes@values" [...]');
  process.exit(1);
}
mkdirSync(join(DIR, 'licenses'), { recursive: true });

for (const spec of specs) {
  const family = spec.split(':')[0].trim();
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://fonts.googleapis.com/css2?family=${spec.trim().replace(/ /g, '+')}&display=block`;

  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) {
    console.error(`ERROR ${family}: Google Fonts answered ${r.status}. Check the name and axes on fonts.google.com.`);
    process.exit(1);
  }
  const css = await r.text();

  const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
  const out = [];
  for (const [, subset, block] of blocks) {
    if (!SUBSETS.includes(subset)) continue;
    const src = block.match(/url\((https:[^)]+)\)/)?.[1];
    if (!src) continue;
    const style = block.match(/font-style:\s*(\w+)/)?.[1] || 'normal';
    const weight = (block.match(/font-weight:\s*([\d ]+)/)?.[1] || '400').trim().replace(/\s+/g, '_');
    const file = `${slug}-${style}-${weight}-${subset}.woff2`;

    const bytes = Buffer.from(await (await fetch(src, { headers: { 'User-Agent': UA } })).arrayBuffer());
    writeFileSync(join(DIR, file), bytes);
    out.push(`/* ${subset} */\n` + block
      .replace(src, file)
      .replace(/font-display:\s*\w+;/, 'font-display: block;'));
  }

  if (!out.length) {
    console.error(`ERROR ${family}: no latin/latin-ext block came back.`);
    process.exit(1);
  }
  writeFileSync(join(DIR, `${slug}.css`), `/* ${family} — downloaded with fonts.mjs. Do not edit by hand. */\n${out.join('\n')}\n`);

  const lic = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family.toLowerCase().replace(/\s+/g, '')}/OFL.txt`);
  if (lic.ok) writeFileSync(join(DIR, 'licenses', `${slug}-OFL.txt`), await lic.text());
  else console.warn(`  (no OFL licence found for ${family}: check its licence on fonts.google.com before sharing)`);

  console.log(`${family}: ${out.length} faces -> assets/fonts/${slug}.css`);
}
