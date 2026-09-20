#!/usr/bin/env node
/**
 * pdf-design / brand.mjs
 *
 * Turns a style you already have into a pdf-design theme. Reads a DESIGN.md, a DTCG
 * tokens.json, a CSS file, an HTML page or a live URL, pulls out the colours and the
 * typefaces, maps them onto the theme variable contract, checks every pair for contrast
 * and writes a theme CSS file plus a one-sheet preview you can print and look at.
 *
 * No npm: Node 18+ ships fetch.
 *
 * Usage:
 *   node brand.mjs <source> [source...] [options]
 *   node brand.mjs ./DESIGN.md ./tokens.json -o ./brand.css
 *   node brand.mjs https://korvel.es --name korvel --fonts
 *   node brand.mjs --check ./brand.css          only report contrast, write nothing
 *
 * Options:
 *   -o, --out <file>   where to write the theme      (default: ./<name>.css)
 *   --name <slug>      theme name, used in comments  (default: from the first source)
 *   --dark             force a dark-paper theme even if the source looks light
 *   --fonts            download the detected families with fonts.mjs into assets/fonts/
 *   --no-preview       do not write <out>-preview.html
 *   --check <file>     audit an existing theme's contrast and exit
 *
 * What it writes:
 *   <out>                 the theme, same variable names as assets/themes/*.css
 *   <out>-preview.html    one sheet with the palette, a type specimen and the components
 *
 * Nothing here is magic. Read the report, fix what it guessed wrong by hand, and print
 * the preview before you trust the theme on a real document.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(HERE, '..', 'assets', 'fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/* ────────────────────────────── colour maths ────────────────────────────── */

const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();

function parseColor(raw) {
  const s = String(raw).trim().toLowerCase();
  let m;
  if ((m = s.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  if ((m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/))) {
    return { r: +m[1], g: +m[2], b: +m[3] };
  }
  if ((m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/))) {
    return hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
  }
  if (s === 'white') return { r: 255, g: 255, b: 255 };
  if (s === 'black') return { r: 0, g: 0, b: 0 };
  return null;
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

// WCAG 2.1 relative luminance and contrast ratio.
const lum = ({ r, g, b }) => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const shift = (c, dl) => { const { h, s, l } = rgbToHsl(c); return hslToRgb(h, s, clamp(l + dl)); };
const sat = c => rgbToHsl(c).s;
const chroma = c => { const { s, l } = rgbToHsl(c); return s * (1 - Math.abs(2 * l - 1)); };

/** Push `fg` lighter or darker until it clears `min` contrast against `bg`, keeping its hue. */
function forceContrast(fg, bg, min, { keepHue = true } = {}) {
  if (contrast(fg, bg) >= min) return fg;
  const goDark = lum(bg) > 0.35;
  const { h, s } = rgbToHsl(fg);
  let best = fg;
  for (let i = 1; i <= 100; i++) {
    const l = clamp(rgbToHsl(fg).l + (goDark ? -i / 100 : i / 100));
    const c = keepHue ? hslToRgb(h, s, l) : { r: 255 * l, g: 255 * l, b: 255 * l };
    best = c;
    if (contrast(c, bg) >= min) return c;
  }
  return best;
}

/* ────────────────────────────── reading sources ────────────────────────────── */

const FONT_NOISE = new Set([
  'inherit', 'initial', 'unset', 'revert', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-monospace', 'ui-serif', 'ui-sans-serif', 'ui-rounded', 'emoji', 'math', 'fangsong',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'helvetica', 'helvetica neue', 'arial', 'roboto',
  'georgia', 'times', 'times new roman', 'courier', 'courier new', 'menlo', 'monaco', 'consolas',
  'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'sans', 'var',
  'regular', 'bold', 'italic', 'medium', 'light', 'semibold', 'black', 'thin', 'normal', 'oblique',
  'extrabold', 'extralight', 'heavy', 'book', 'roman', 'uppercase', 'lowercase', 'none', 'auto',
]);

async function loadSource(src) {
  if (/^https?:\/\//i.test(src)) return fetchSite(src);
  const p = resolve(src);
  if (!existsSync(p)) throw new Error(`Source not found: ${src}`);
  return { kind: extname(p).slice(1).toLowerCase() || 'txt', label: basename(p), text: readFileSync(p, 'utf8') };
}

/** Fetch a page and its first few stylesheets. Plain HTTP, no browser: enough for colours
 *  and font names. For a deep read of a site, use a dedicated site-analysis tool instead. */
async function fetchSite(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  let text = await r.text();
  const hrefs = [...text.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)]
    .map(t => t[0].match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean)
    .map(h => { try { return new URL(h, url).href; } catch { return null; } }).filter(Boolean)
    .filter(h => !/fonts\.googleapis|fonts\.gstatic/.test(h)).slice(0, 6);
  for (const h of hrefs) {
    try {
      const rr = await fetch(h, { headers: { 'User-Agent': UA } });
      if (rr.ok) text += '\n/* ' + h + ' */\n' + (await rr.text()).slice(0, 400_000);
    } catch { /* a stylesheet that will not load is not a reason to stop */ }
  }
  // Google Fonts links name the families even when we skip downloading the CSS.
  for (const g of text.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'<>]+)/gi)) {
    for (const f of g[1].matchAll(/family=([^&:]+)/g)) text += `\nfont-family: "${decodeURIComponent(f[1]).replace(/\+/g, ' ')}";`;
  }
  return { kind: 'html', label: url, text };
}

/** DTCG tokens.json (what /radiografia-web writes) — walk it and keep the path as a name hint. */
function harvestTokens(obj, path, colors, fonts) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(v => harvestTokens(v, path, colors, fonts)); return; }
  const type = obj.$type || obj.type;
  const value = obj.$value ?? obj.value;
  if (value !== undefined && (typeof value === 'string' || Array.isArray(value))) {
    const v = Array.isArray(value) ? value.join(', ') : value;
    if (type === 'color' || parseColor(v)) { const c = parseColor(v); if (c) colors.push({ c, name: path.join('.'), weight: 3 }); }
    if (type === 'fontFamily' || /font(Family)?$/i.test(path.at(-1) || '')) pushFonts(v, path.join('.'), fonts, 3);
  }
  for (const [k, v] of Object.entries(obj)) if (!k.startsWith('$')) harvestTokens(v, [...path, k], colors, fonts);
}

function pushFonts(decl, name, fonts, weight) {
  for (const part of String(decl).split(',')) {
    const f = part.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
    if (!f || f.length > 40 || FONT_NOISE.has(f.toLowerCase()) || /^var\(|^\$|^--/.test(f)) continue;
    fonts.push({ family: f, name, weight });
  }
}

/** Pull every colour and font out of one source, with a name hint and a weight per hit. */
function harvest(src, colors, fonts) {
  const { kind, text } = src;

  if (kind === 'json') {
    try { harvestTokens(JSON.parse(text), [], colors, fonts); return; } catch { /* fall through to text scan */ }
  }

  // CSS custom properties and declarations: `--brand-bg: #101014;` / `color: #fff;`
  for (const m of text.matchAll(/(--[\w-]+|\b(?:background(?:-color)?|color|border-color|fill|stroke|accent-color))\s*:\s*([^;}\n]+)/gi)) {
    const c = parseColor(m[2].trim().split(/\s+/)[0]);
    if (c) colors.push({ c, name: m[1].toLowerCase(), weight: m[1].startsWith('--') ? 3 : 2 });
  }
  for (const m of text.matchAll(/font-family\s*:\s*([^;}\n]+)/gi)) pushFonts(m[1], 'font-family', fonts, 2);

  // Markdown / prose: "Accent: #E4572E", "**Display** — Fraunces", "`Inter`"
  for (const line of text.split('\n')) {
    const label = (line.match(/^[\s>*\-|#]*\**([A-Za-z][\w \-/]{2,28})\**\s*[:—–-]/) || [])[1]?.toLowerCase().trim();
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]+\)|\bhsla?\([^)]+\)/g)) {
      const c = parseColor(m[0]);
      if (c) colors.push({ c, name: label || '', weight: label ? 3 : 1 });
    }
    if (label && /\b(font|typeface|tipograf|display|heading|titul|body|text|cuerpo)\b/i.test(label)) {
      const rest = line.split(/[:—–-]/).slice(1).join(' ');
      for (const m of rest.matchAll(/["'`]([A-Z][\w ]{2,30})["'`]|\b([A-Z][a-z]+(?: [A-Z][a-z0-9]+){0,3})\b/g)) {
        pushFonts(m[1] || m[2], label, fonts, /display|head|titul/i.test(label) ? 4 : 3);
      }
    }
  }
}

/* ────────────────────────────── mapping to the contract ────────────────────────────── */

const HINT = {
  paper: /\b(bg|background|paper|canvas|page|base|surface-0|body-bg)\b/,
  surface: /\b(surface|card|panel|elevated|subtle|muted-bg|fill)\b/,
  ink: /\b(ink|text|fg|foreground|body|copy|on-?bg|heading|title)\b/,
  muted: /\b(muted|secondary|subtle-text|dim|caption|tertiary|placeholder)\b/,
  line: /\b(line|border|divider|rule|stroke|outline|hairline)\b/,
  accent: /\b(accent|primary|brand|cta|highlight|link|action)\b/,
  bad: /\b(bad|error|danger|destructive|alert|negative|red)\b/,
  good: /\b(good|success|positive|ok|valid|green)\b/,
};

function pickByHint(colors, key, used) {
  const re = HINT[key];
  const hits = colors.filter(c => re.test(c.name) && !used.has(hex(c.c)));
  if (!hits.length) return null;
  // Prefer the token that names the role most plainly and shows up most often.
  const score = new Map();
  for (const h of hits) {
    const k = hex(h.c);
    score.set(k, (score.get(k) || 0) + h.weight + (h.name.split(/[-.]/).length <= 3 ? 1 : 0));
  }
  const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return parseColor(best);
}

function build(colors, opts) {
  const notes = [];
  const used = new Set();
  const take = (c, why) => { if (c) { used.add(hex(c)); notes.push(why); } return c; };

  // Collapse duplicates so frequency means something.
  const tally = new Map();
  for (const { c, name, weight } of colors) {
    const k = hex(c);
    const e = tally.get(k) || { c, names: [], n: 0 };
    e.n += weight; if (name) e.names.push(name);
    tally.set(k, e);
  }
  const all = [...tally.values()].sort((a, b) => b.n - a.n);
  const byLum = [...all].sort((a, b) => lum(a.c) - lum(b.c));

  let paper = pickByHint(colors, 'paper', used);
  let ink = pickByHint(colors, 'ink', used);

  // No named roles? Fall back to the extremes of what the source actually uses.
  const lightest = byLum.at(-1)?.c, darkest = byLum[0]?.c;
  if (!paper) paper = opts.dark ? darkest : lightest;
  if (!ink) ink = opts.dark ? lightest : darkest;
  if (!paper || !ink) throw new Error('Not enough colours in the source to build a theme. Give it a CSS, a tokens.json or a DESIGN.md with hex values.');

  // If the source is a dark site, honour that unless --dark says otherwise.
  const darkPaper = opts.dark || lum(paper) < 0.35;
  if (darkPaper && lum(paper) > lum(ink)) [paper, ink] = [ink, paper];
  if (!darkPaper && lum(paper) < lum(ink)) [paper, ink] = [ink, paper];
  take(paper, `paper from ${tally.get(hex(paper))?.names[0] || 'the lightest colour in the source'}`);
  take(ink, `ink from ${tally.get(hex(ink))?.names[0] || 'the darkest colour in the source'}`);

  // Accent: the most colourful thing that is not the paper or the ink.
  let accent = pickByHint(colors, 'accent', used);
  if (!accent) {
    const cand = all.filter(e => chroma(e.c) > 0.14 && !used.has(hex(e.c)))
      .sort((a, b) => (chroma(b.c) * 2 + b.n / 20) - (chroma(a.c) * 2 + a.n / 20))[0];
    accent = cand?.c || null;
  }
  if (!accent) { accent = hslToRgb(rgbToHsl(ink).h + 180, 0.7, darkPaper ? 0.62 : 0.45); notes.push('accent INVENTED: the source has no colourful hue. Replace it by hand.'); }
  else take(accent, `accent from ${tally.get(hex(accent))?.names[0] || 'the most saturated colour in the source'}`);

  let muted = pickByHint(colors, 'muted', used) || mix(ink, paper, 0.42);
  let line = pickByHint(colors, 'line', used) || mix(ink, paper, darkPaper ? 0.82 : 0.78);
  let surface = pickByHint(colors, 'surface', used) || mix(paper, ink, darkPaper ? 0.06 : 0.035);

  let bad = pickByHint(colors, 'bad', used) || hslToRgb(4, darkPaper ? 0.9 : 0.62, darkPaper ? 0.68 : 0.43);
  let good = pickByHint(colors, 'good', used) || hslToRgb(148, darkPaper ? 0.62 : 0.4, darkPaper ? 0.58 : 0.3);

  // Contrast is not negotiable: nudge, then say what was nudged.
  const fix = (c, bg, min, label) => {
    const out = forceContrast(c, bg, min);
    if (hex(out) !== hex(c)) notes.push(`${label} moved ${hex(c)} -> ${hex(out)} to reach ${min}:1 on the paper.`);
    return out;
  };
  ink = fix(ink, paper, 8, 'ink');
  muted = fix(muted, paper, 4.6, 'muted');
  bad = fix(bad, paper, 4.5, 'bad');
  good = fix(good, paper, 4.5, 'good');

  const accentDeep = fix(shift(accent, darkPaper ? 0.06 : -0.12), paper, 4.5, 'accent-deep');
  const accentSoft = darkPaper ? mix(paper, accent, 0.16) : mix(paper, accent, 0.14);
  const badSoft = darkPaper ? mix(paper, bad, 0.16) : mix(paper, bad, 0.13);
  const goodSoft = darkPaper ? mix(paper, good, 0.16) : mix(paper, good, 0.13);

  // `dark` / `light` drive the dark blocks and dark sheets. They must work against each other.
  let dark = darkPaper ? shift(paper, -0.05) : (lum(ink) < 0.12 ? ink : shift(ink, -0.04));
  let light = darkPaper ? ink : paper;
  if (contrast(light, dark) < 8) { dark = forceContrast(dark, light, 8); notes.push(`dark deepened to ${hex(dark)} so light text holds on it.`); }

  return {
    darkPaper,
    vars: {
      '--c-paper': paper, '--c-surface': surface, '--c-ink': ink, '--c-muted': muted, '--c-line': line,
      '--c-dark': dark, '--c-light': light,
      '--c-accent': accent, '--c-accent-deep': accentDeep, '--c-accent-soft': accentSoft,
      '--c-bad': bad, '--c-bad-soft': badSoft,
      '--c-good': good, '--c-good-soft': goodSoft,
    },
    notes,
  };
}

/* ────────────────────────────── fonts ────────────────────────────── */

const slugOf = f => f.toLowerCase().replace(/\s+/g, '-');

function chooseFonts(fonts) {
  const tally = new Map();
  for (const { family, name, weight } of fonts) {
    const e = tally.get(family) || { family, n: 0, display: 0 };
    e.n += weight;
    if (/display|head|titul|h1|h2|title|serif-display/i.test(name)) e.display += weight;
    tally.set(family, e);
  }
  const ranked = [...tally.values()].sort((a, b) => b.n - a.n);
  if (!ranked.length) return { display: null, text: null, ranked };
  const display = ranked.find(f => f.display > 0) || ranked[0];
  const text = ranked.find(f => f.family !== display.family) || display;
  return { display: display.family, text: text.family, ranked };
}

function fontState(family) {
  if (!family) return null;
  const css = join(FONTS_DIR, `${slugOf(family)}.css`);
  return { family, slug: slugOf(family), css, have: existsSync(css) };
}

function downloadFont(family) {
  const specs = [`${family}:ital,wght@0,300..800;1,300..800`, `${family}:wght@300..800`, family];
  for (const spec of specs) {
    const r = spawnSync(process.execPath, [join(HERE, 'fonts.mjs'), spec], { encoding: 'utf8' });
    if (r.status === 0) return true;
  }
  return false;
}

/* ────────────────────────────── output ────────────────────────────── */

function writeTheme(out, name, sources, theme, df, tf) {
  const imports = [df, tf].filter(f => f?.have).map(f => f.css)
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(p => `@import url("${relImport(out, p)}");`).join('\n');
  const stack = (f, fb) => f ? `"${f.family}", ${fb}` : fb;
  const V = theme.vars;
  const row = (...keys) => keys.map(k => `${k}: ${hex(V[k])};`).join('  ');

  const css = `/* ${name} — generated by pdf-design/scripts/brand.mjs on ${new Date().toISOString().slice(0, 10)}
   Source: ${sources.join(' · ')}
   Generated, not sacred: check the preview, then fix any value by hand. Keep the variable names. */

${imports || '/* No local font file yet — see the report from brand.mjs. */'}

:root {
  ${row('--c-paper', '--c-surface', '--c-ink', '--c-muted', '--c-line')}
  ${row('--c-dark', '--c-light')}
  ${row('--c-accent', '--c-accent-deep', '--c-accent-soft')}
  ${row('--c-bad', '--c-bad-soft')}
  ${row('--c-good', '--c-good-soft')}

  --f-display: ${stack(df, theme.darkPaper ? 'system-ui, sans-serif' : 'Georgia, serif')};
  --f-text: ${stack(tf, 'system-ui, sans-serif')};
  --w-display: 700;
}
`;
  writeFileSync(out, css);
}

function relImport(out, target) {
  const from = dirname(resolve(out)).split(/[\\/]/), to = resolve(target).split(/[\\/]/);
  while (from.length && to.length && from[0].toLowerCase() === to[0].toLowerCase()) { from.shift(); to.shift(); }
  const rel = [...from.map(() => '..'), ...to].join('/');
  return rel.startsWith('.') ? rel : './' + rel;
}

/** One A4 sheet that shows the whole theme at once: swatches, type, table, callouts, a stat. */
function writePreview(file, name, theme, df, tf, report) {
  const V = theme.vars;
  const sw = (k) => `<div class="sw"><span class="chipbox" style="background:var(${k});border:.4pt solid var(--c-line)"></span><span class="small"><b>${k.replace('--c-', '')}</b> ${hex(V[k])}</span></div>`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${name} — theme preview</title>
<style>
  .sw { display:flex; align-items:center; gap:2.5mm; }
  .chipbox { width:9mm; height:9mm; border-radius:1mm; display:inline-block; flex:none; }
  .swatches { display:grid; grid-template-columns:repeat(4,1fr); gap:3mm 5mm; }
</style>
</head>
<body class="format-a4" data-theme="./${basename(file).replace(/-preview\.html$/, '.css')}">

<section class="sheet">
  <header class="head"><span class="brand">${name}</span><span class="muted">pdf-design theme preview</span></header>
  <div class="content">
    <div class="eyebrow">Theme check</div>
    <h1 class="display">Read this page.<br><span class="accent">If it hurts, fix the theme.</span></h1>
    <p class="lead muted measure">Display type is ${df?.family || 'a system fallback'}. Reading type is ${tf?.family || 'a system fallback'}.</p>

    <div class="swatches" style="margin-top:6mm">
      ${['--c-paper', '--c-surface', '--c-ink', '--c-muted', '--c-line', '--c-accent', '--c-accent-deep', '--c-accent-soft', '--c-dark', '--c-light', '--c-bad', '--c-good'].map(sw).join('\n      ')}
    </div>

    <div class="grid" style="margin-top:7mm">
      <div class="span-5 stat"><span class="number">84 %</span><span class="caption">A figure at full size, in the display face.</span></div>
      <div class="span-7">
        <table class="table">
          <tr><th style="width:34mm">Row</th><th>Meaning</th><th>Mark</th></tr>
          <tr class="highlight"><td><b>Recommended</b></td><td>The accent row must read as chosen.</td><td><span class="chip chip--good">Yes</span></td></tr>
          <tr class="dim"><td>Discarded</td><td>Dim rows must still be legible.</td><td><span class="chip chip--bad">No</span></td></tr>
        </table>
      </div>
    </div>

    <div class="grid grid--stretch" style="margin-top:6mm">
      <div class="span-6 callout callout--bad"><span class="callout-title">Risk colour</span><p>Red must read without the word "risk".</p></div>
      <div class="span-6 callout callout--good"><span class="callout-title">Confirmation colour</span><p>Green must read without the word "ok".</p></div>
    </div>

    <div class="dark" style="padding:8mm 9mm;margin-top:6mm">
      <span class="eyebrow">Dark block</span>
      <p style="font-family:var(--f-display);font-size:20pt;line-height:1.14">Light text on dark. <span class="accent">The accent must survive here too.</span></p>
    </div>
  </div>
  <footer class="foot"><span class="muted">${report.replace(/\n/g, ' · ').slice(0, 150)}</span><span class="folio"></span></footer>
</section>

</body>
</html>
`;
  writeFileSync(file, html);
}

/* ────────────────────────────── contrast audit ────────────────────────────── */

const PAIRS = [
  ['--c-ink', '--c-paper', 8, 'body text on paper'],
  ['--c-ink', '--c-surface', 7, 'text on a surface panel'],
  ['--c-muted', '--c-paper', 4.5, 'secondary text on paper'],
  ['--c-accent-deep', '--c-paper', 4.5, 'accent text on paper'],
  ['--c-accent', '--c-paper', 3, 'accent rules and marks on paper'],
  ['--c-bad', '--c-paper', 4.5, 'risk text on paper'],
  ['--c-good', '--c-paper', 4.5, 'confirmation text on paper'],
  ['--c-ink', '--c-accent-soft', 4.5, 'text on the soft accent block'],
  ['--c-ink', '--c-bad-soft', 4.5, 'text on the risk callout'],
  ['--c-ink', '--c-good-soft', 4.5, 'text on the confirmation callout'],
  ['--c-light', '--c-dark', 8, 'light text on a dark sheet'],
  ['--c-accent', '--c-dark', 3, 'accent on a dark sheet'],
];

function audit(vars) {
  const out = [];
  for (const [fg, bg, min, what] of PAIRS) {
    if (!vars[fg] || !vars[bg]) continue;
    const r = contrast(vars[fg], vars[bg]);
    out.push({ what, fg, bg, ratio: r, min, ok: r >= min });
  }
  return out;
}

function readThemeVars(file) {
  const css = readFileSync(file, 'utf8');
  const vars = {};
  for (const m of css.matchAll(/(--c-[\w-]+)\s*:\s*([^;}\n]+)/g)) {
    const c = parseColor(m[2].trim());
    if (c) vars[m[1]] = c;
  }
  return vars;
}

/* ────────────────────────────── main ────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (n, d) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };

const checkFile = opt('--check', null);
if (checkFile) {
  const vars = readThemeVars(checkFile);
  const rows = audit(vars);
  console.log(`\nContrast audit — ${basename(checkFile)}\n`);
  for (const r of rows) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.ratio.toFixed(2)}:1  (needs ${r.min})  ${r.what}`);
  const bad = rows.filter(r => !r.ok);
  console.log(bad.length ? `\n${bad.length} pair(s) below target. Darken or lighten the colour on the left.\n` : '\nAll pairs pass.\n');
  process.exit(bad.length ? 1 : 0);
}

const doDark = flag('--dark');
const doFonts = flag('--fonts');
const noPreview = flag('--no-preview');
const outArg = opt('-o', null) || opt('--out', null);
const nameArg = opt('--name', null);
const sources = argv.filter(a => !a.startsWith('-'));

if (!sources.length) {
  console.error(`Usage: node brand.mjs <DESIGN.md | tokens.json | style.css | page.html | https://site> [...] [-o out.css] [--name x] [--dark] [--fonts]
       node brand.mjs --check <theme.css>`);
  process.exit(1);
}

const name = nameArg || basename(sources[0].replace(/^https?:\/\//, '').replace(/[\\/].*$/, ''), extname(sources[0])).toLowerCase().replace(/[^\w-]+/g, '-');
const out = resolve(outArg || `./${name}.css`);

const colors = [], fonts = [], labels = [];
for (const s of sources) {
  const src = await loadSource(s);
  labels.push(src.label);
  harvest(src, colors, fonts);
}
if (!colors.length) { console.error('No colours found in the source. Give it a file with hex, rgb() or hsl() values.'); process.exit(1); }

const theme = build(colors, { dark: doDark });
const picked = chooseFonts(fonts);
let df = fontState(picked.display), tf = fontState(picked.text);

// Fonts first: the theme can only @import a family whose woff2 is already on disk.
const fontLines = [];
if (!picked.ranked.length) fontLines.push('  none named in the source — the theme falls back to system fonts. Set --f-display and --f-text by hand.');
for (const f of [df, tf].filter(Boolean).filter((v, i, a) => a.findIndex(x => x.family === v.family) === i)) {
  if (f.have) fontLines.push(`  ${f.family}: already in assets/fonts/${f.slug}.css`);
  else if (doFonts && downloadFont(f.family)) { f.have = true; fontLines.push(`  ${f.family}: downloaded into assets/fonts/`); }
  else if (doFonts) fontLines.push(`  ${f.family}: NOT on Google Fonts — add the woff2 by hand or pick another family`);
  else fontLines.push(`  ${f.family}: missing, so the theme falls back to a system font. Run  node "${join(HERE, 'fonts.mjs')}" "${f.family}:wght@300..800"  then re-run brand.mjs.`);
}
if (picked.ranked.length > 2) fontLines.push(`  also seen: ${picked.ranked.slice(2, 7).map(f => f.family).join(', ')}`);

writeTheme(out, name, labels, theme, df, tf);

/* Report ------------------------------------------------------------------ */
const lines = [];
lines.push(`\npdf-design / brand.mjs — ${name}`);
lines.push(`Sources: ${labels.join(', ')}`);
lines.push(`Found ${new Set(colors.map(c => hex(c.c))).size} distinct colours and ${new Set(fonts.map(f => f.family)).size} named typefaces.\n`);

lines.push('Palette');
for (const [k, v] of Object.entries(theme.vars)) lines.push(`  ${k.padEnd(16)} ${hex(v)}`);
if (theme.notes.length) { lines.push('\nDecisions'); theme.notes.forEach(n => lines.push(`  - ${n}`)); }

lines.push('\nTypefaces', ...fontLines);

lines.push('\nContrast');
const rows = audit(theme.vars);
for (const r of rows) lines.push(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.ratio.toFixed(2)}:1  (needs ${r.min})  ${r.what}`);

if (!noPreview) {
  const pv = out.replace(/\.css$/, '') + '-preview.html';
  writePreview(pv, name, theme, df, tf, `${name} - generated by brand.mjs`);
  lines.push(`\nPreview: ${pv}\n  node "${join(HERE, 'print.mjs')}" "${pv}"`);
}
lines.push(`\nTheme:   ${out}`);
lines.push(`Use it:  <body class="format-a4" data-theme="./${basename(out)}">   (the path is relative to your document)\n`);

console.log(lines.join('\n'));
if (rows.some(r => !r.ok)) {
  console.log('Some pairs are below target. brand.mjs only nudges text colours; fix the rest by hand and re-run --check.\n');
}
