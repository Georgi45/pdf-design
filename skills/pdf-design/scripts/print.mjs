#!/usr/bin/env node
/**
 * pdf-design / print.mjs — sheet-based HTML → vector PDF, with automatic QA.
 *
 * Usage:
 *   node print.mjs <document.html> [--no-png] [--scale=1]
 *
 * What it does, in order:
 *   1. Adds base.css + the theme named in <body data-theme="…"> (from ../assets) and inlines
 *      everything local as data URIs: <link> CSS, @import, fonts, images, <!-- include: path -->.
 *      (Chrome prints before linked web fonts finish loading, and ignores url() inside @page.)
 *   2. Opens headless Chrome / Chromium / Edge over CDP in print mode, waits for document.fonts.ready.
 *   3. Checks every .sheet: content cut off or overlapping the footer, text inside the safe margin,
 *      large empty gaps (the "half-empty page"), tiny text, fallback fonts, broken images.
 *   4. Injects @page with the exact sheet size and prints with zero margins and backgrounds on.
 *   5. Checks the PDF: pages = sheets, every font used is embedded, no system-font fallbacks.
 *   6. Saves one PNG per sheet so the agent can look at every page before delivering.
 *
 * Output, next to the HTML:
 *   <document>.pdf
 *   <document>-review/sheet-01.png …  qa.json  _printed.html (the self-contained copy that was printed)
 *
 * Exit code 1 when there are errors. No npm: Node 22+ ships fetch and WebSocket.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute, extname, basename, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir, homedir } from 'node:os';

if (typeof WebSocket === 'undefined') {
  console.error(`print.mjs needs Node 22 or newer (built-in WebSocket). You have ${process.version}. Install it from nodejs.org.`);
  process.exit(1);
}

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const INPUT = args.find(a => !a.startsWith('--'));
const opt = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const NO_PNG = args.includes('--no-png');
const SCALE = Number(opt('scale', '1'));

if (!INPUT || !existsSync(INPUT)) {
  console.error('Usage: node print.mjs <document.html> [--no-png] [--scale=1]');
  process.exit(1);
}
const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(SKILL_DIR, 'assets');
const THEMES = join(ASSETS, 'themes');
const HTML_IN = resolve(INPUT);
const BASE = dirname(HTML_IN);
const NAME = basename(HTML_IN, extname(HTML_IN));
const PDF_OUT = join(BASE, `${NAME}.pdf`);
const REVIEW = join(BASE, `${NAME}-review`);
rmSync(REVIEW, { recursive: true, force: true });   // no stale PNGs from an older version
mkdirSync(REVIEW, { recursive: true });

const errors = [];
const warnings = [];

// ---------------------------------------------------------------- 1. inline everything
const MIME = {
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif',
};

// Disk path of a local reference, or null when it is remote / data / an anchor.
function localPath(ref, base) {
  ref = ref.trim().replace(/^['"]|['"]$/g, '');
  if (!ref || /^(data:|https?:|#|about:|mailto:|tel:)/i.test(ref)) return null;
  if (/^file:/i.test(ref)) return fileURLToPath(ref.split(/[?#]/)[0]);
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  return isAbsolute(clean) ? clean : resolve(base, clean);
}

function dataUri(path) {
  if (!existsSync(path)) { errors.push(`File not found: ${path}`); return null; }
  const mime = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

function inlineCss(css, base, seen = new Set()) {
  css = css.replace(/@import\s+(?:url\()?\s*(['"]?)([^'")]+)\1\s*\)?\s*;/g, (all, _q, ref) => {
    const path = localPath(ref, base);
    if (!path) { warnings.push(`Remote @import (may not load in time): ${ref}`); return all; }
    if (!existsSync(path)) { errors.push(`@import of a missing file: ${path}`); return ''; }
    if (seen.has(path)) return '';
    seen.add(path);
    return inlineCss(readFileSync(path, 'utf8'), dirname(path), seen);
  });
  // Unquoted on purpose: base64 has no quotes or parentheses, so it also works inside style="…".
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, _q, ref) => {
    const path = localPath(ref, base);
    if (!path) return all;
    const uri = dataUri(path);
    return uri ? `url(${uri})` : all;
  });
}

let html = readFileSync(HTML_IN, 'utf8');

if (/fonts\.googleapis\.com/.test(html)) {
  errors.push('The HTML links Google Fonts. Download the font with scripts/fonts.mjs and import it from a theme.');
}

// <!-- include: path --> → the file's content (e.g. an SVG logo sprite, so <use href="#logo">
// inherits currentColor).
html = html.replace(/<!--\s*include:\s*(.+?)\s*-->/g, (all, ref) => {
  const path = localPath(ref, BASE);
  if (!path || !existsSync(path)) { errors.push(`include: file not found: ${ref}`); return ''; }
  return readFileSync(path, 'utf8');
});
// The document's own <style> blocks (before converting <link>s, so nothing is processed twice)
html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_t, a, css, c) => a + inlineCss(css, BASE) + c);
// <link rel="stylesheet"> → <style> with everything inside
html = html.replace(/<link\b[^>]*>/gi, tag => {
  if (!/rel=["']?stylesheet/i.test(tag)) return /rel=["']?preconnect/i.test(tag) ? '' : tag;
  const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
  const path = href && localPath(href, BASE);
  if (!path) { warnings.push(`Remote CSS (may not load in time): ${href}`); return tag; }
  if (!existsSync(path)) { errors.push(`Linked CSS not found: ${path}`); return ''; }
  return `<style>/* ${basename(path)} */\n${inlineCss(readFileSync(path, 'utf8'), dirname(path))}\n</style>`;
});
// <img src> and SVG <image href>
html = html.replace(/(<(?:img|image)\b[^>]*?\s(?:src|href|xlink:href)=)(["'])([^"']+)\2/gi, (t, pre, q, ref) => {
  const path = localPath(ref, BASE);
  if (!path) { if (/^https?:/i.test(ref)) warnings.push(`Remote image (may not load in time): ${ref}`); return t; }
  const uri = dataUri(path);
  return uri ? `${pre}${q}${uri}${q}` : t;
});
// style="background-image:url(…)"
html = html.replace(/\sstyle=(["'])([\s\S]*?)\1/gi, (t, q, css) =>
  css.includes('url(') ? ` style=${q}${inlineCss(css, BASE)}${q}` : t);

// base.css + theme, first thing in <head>, so the document's own <style> can override them.
const themeName = html.match(/<body\b[^>]*\bdata-theme=["']([^"']+)["']/i)?.[1] || 'editorial';
const themePath = /^[\w-]+$/.test(themeName) ? join(THEMES, `${themeName}.css`) : localPath(themeName, BASE);
const builtIn = readdirSync(THEMES).filter(f => f.endsWith('.css')).map(f => f.slice(0, -4)).join(', ');
if (!themePath || !existsSync(themePath)) {
  errors.push(`Theme not found: "${themeName}". Built-in themes: ${builtIn}. Or give a path relative to the document.`);
}
if (!/<link\b[^>]*href=["'][^"']*base\.css["']/i.test(html)) {
  let inject = `<style>/* base.css */\n${inlineCss(readFileSync(join(ASSETS, 'base.css'), 'utf8'), ASSETS)}\n</style>\n`;
  if (themePath && existsSync(themePath)) {
    inject += `<style>/* ${basename(themePath)} */\n${inlineCss(readFileSync(themePath, 'utf8'), dirname(themePath))}\n</style>\n`;
  }
  html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, m => `${m}\n${inject}`) : inject + html;
}

const PRINTED = join(REVIEW, '_printed.html');
writeFileSync(PRINTED, html);

// ---------------------------------------------------------------- 2. find a browser
function findBrowser() {
  const home = homedir();
  const local = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
  const fixed = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ].filter(Boolean);
  for (const p of fixed) if (existsSync(p)) return p;

  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'microsoft-edge', 'msedge'];
  const exts = process.platform === 'win32' ? ['.exe'] : [''];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const n of names) for (const e of exts) { const p = join(dir, n + e); if (existsSync(p)) return p; }
  }

  // Playwright-managed Chromium. Cloud sandboxes keep it in /opt/pw-browsers.
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(home, '.cache', 'ms-playwright'),
    join(local, 'ms-playwright'), join(home, 'Library', 'Caches', 'ms-playwright')].filter(Boolean);
  const inside = ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell'];
  for (const root of roots) {
    let dirs;
    try { dirs = readdirSync(root).filter(d => d.startsWith('chromium')); } catch { continue; }
    // newest first, full Chromium before the headless shell
    dirs.sort().reverse();
    dirs.sort((a, b) => a.includes('headless') - b.includes('headless'));
    for (const d of dirs) {
      const full = join(root, d);
      try { if (statSync(full).isFile()) return full; } catch {}
      for (const i of inside) { const p = join(full, i); if (existsSync(p)) return p; }
    }
  }
  return null;
}

const BROWSER = findBrowser();
if (!BROWSER) {
  console.error('No Chrome, Chromium or Edge found. Install Google Chrome, or set CHROME_PATH to the browser executable.');
  process.exit(1);
}

// ---------------------------------------------------------------- 3. talk CDP
const PORT = 9222 + Math.floor(Math.random() * 700);
const PROFILE = join(tmpdir(), `pdf-design-browser-${PORT}`);
const flags = [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  '--font-render-hinting=none',          // same font metrics on screen and in the PDF
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
];
if (process.platform === 'linux') {
  flags.push('--disable-dev-shm-usage');
  if (process.getuid?.() === 0) flags.push('--no-sandbox');   // containers run as root
}
const browser = spawn(BROWSER, [...flags, 'about:blank'], { stdio: 'ignore' });
browser.on('error', e => { console.error(`Could not start the browser (${BROWSER}): ${e.message}`); process.exit(1); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stop = () => { try { browser.kill('SIGKILL'); } catch {} };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(1); });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { await sleep(250); }
}
if (!wsUrl) { console.error('The browser did not open its debugging port.'); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const listeners = new Set();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(`${m.error.message} ${m.error.data || ''}`)) : res(m.result);
  } else if (m.method) {
    for (const fn of listeners) fn(m);
  }
};
const send = (method, params = {}, sessionId, ms = 120000) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`The browser did not answer ${method}`)); } }, ms);
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: ses } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p, ms) => send(m, p, ses, ms);
const waitFor = (method, ms = 30000) => new Promise((res, rej) => {
  const t = setTimeout(() => { listeners.delete(f); rej(new Error(`The browser never fired ${method}`)); }, ms);
  const f = m => { if (m.method === method && m.sessionId === ses) { clearTimeout(t); listeners.delete(f); res(m.params); } };
  listeners.add(f);
});
async function evaluate(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS in the page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}

await cdp('Page.enable');
await cdp('Emulation.setEmulatedMedia', { media: 'print' });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
const loaded = waitFor('Page.loadEventFired');
await cdp('Page.navigate', { url: pathToFileURL(PRINTED).href });
await loaded;

const fonts = await evaluate(`(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
  return [...document.fonts].map(f => ({ family: f.family.replace(/["']/g, ''), status: f.status }));
})()`);
await sleep(300);

// ---------------------------------------------------------------- 4. quality checks
// Measures every sheet in print mode. Anything with data-deco (glows, bleed photos, background
// numbers) is ignored; data-bleed may touch the edge on purpose; a sheet with data-airy has its
// empty space by design (cover, divider, quote, closing).
const QA = `(() => {
  const MM = 96 / 25.4;
  const r = { sheets: [], errors: [], warnings: [] };
  const sheets = [...document.querySelectorAll('section.sheet')];
  if (!sheets.length) { r.errors.push('There is no <section class="sheet">. Every PDF page is one .sheet.'); return r; }
  const R0 = sheets[0].getBoundingClientRect();
  r.width = R0.width; r.height = R0.height;

  for (const el of document.body.children) {
    if (el.matches('section.sheet, script, style, link, template, [hidden]')) continue;
    const b = el.getBoundingClientRect();
    if (b.width * b.height < 1 || getComputedStyle(el).display === 'none') continue;
    r.errors.push('Content outside the sheets (<' + el.tagName.toLowerCase() + '>). Everything goes inside a <section class="sheet">.');
  }

  const loaded = new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
  const GENERIC = /^(serif|sans-serif|system-ui|monospace|cursive|ui-\\w+|-apple-system|inherit)$/i;
  const fallback = new Set();

  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const isContent = (el, cs) => ownText(el) || /^(IMG|SVG|CANVAS|TABLE|HR|VIDEO)$/i.test(el.tagName)
    || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')
    || parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) > 0;

  sheets.forEach((s, i) => {
    const n = i + 1;
    const S = s.getBoundingClientRect();
    const cs0 = getComputedStyle(s);
    const safe = {
      top: S.top + parseFloat(cs0.paddingTop), bottom: S.bottom - parseFloat(cs0.paddingBottom),
      left: S.left + parseFloat(cs0.paddingLeft), right: S.right - parseFloat(cs0.paddingRight),
    };
    const info = { n, classes: s.className, largestGap: 0 };
    if (Math.abs(S.width - R0.width) > .5 || Math.abs(S.height - R0.height) > .5)
      r.errors.push('Sheet ' + n + ': different size from the first sheet. All sheets in one PDF share a size.');

    const content = s.querySelector(':scope > .content');
    const CB = content && content.getBoundingClientRect();
    const spans = [];
    const cut = new Set(), edge = new Set(), over = new Set(), tiny = new Set(), wide = new Set();

    for (const el of s.querySelectorAll('*')) {
      if (el.closest('[data-deco]') || el.closest('svg') !== null && el.tagName.toLowerCase() !== 'svg') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'contents') continue;
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      const name = el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : '');
      const bleed = el.closest('[data-bleed]');

      // outside the sheet: cut off in the PDF
      if (!bleed && (b.top < S.top - 1 || b.bottom > S.bottom + 1 || b.left < S.left - 1 || b.right > S.right + 1)) cut.add(name);
      // does not fit in .content: runs over the footer
      else if (CB && content.contains(el) && b.bottom > CB.bottom + 1) over.add(name);
      // text inside the safe margin (block boxes only: inline spans in big display type report the
      // font's ascent, which pokes above the line box without the text really moving)
      else if (!bleed && ownText(el) && cs.display !== 'inline' &&(b.top < safe.top - 1 || b.bottom > safe.bottom + 1 || b.left < safe.left - 1 || b.right > safe.right + 1)) edge.add(name);

      if (ownText(el)) {
        // text wider than its own box (a no-wrap number or word spilling out of its column)
        if (cs.display !== 'inline' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) wide.add(name);
        if (parseFloat(cs.fontSize) < 7 * 96 / 72 - .05) tiny.add(name + ' (' + (parseFloat(cs.fontSize) * 72 / 96).toFixed(1) + ' pt)');
        const first = cs.fontFamily.split(',')[0].trim().replace(/["']/g, '');
        if (!GENERIC.test(first) && !loaded.has(first)) fallback.add(first);
      }
      if (isContent(el, cs)) spans.push([Math.max(b.top, safe.top), Math.min(b.bottom, safe.bottom)]);
    }
    if (cut.size)  r.errors.push('Sheet ' + n + ': cut off at the sheet edge → ' + [...cut].slice(0, 5).join(', '));
    if (over.size) r.errors.push('Sheet ' + n + ': content does not fit and runs over the footer → ' + [...over].slice(0, 5).join(', ') + '. Move content to another sheet or cut text; do not shrink the type.');
    if (wide.size) r.errors.push('Sheet ' + n + ': text wider than its column → ' + [...wide].slice(0, 5).join(', ') + '. Make it smaller or give it a wider column.');
    if (edge.size) r.warnings.push('Sheet ' + n + ': text inside the safe margin → ' + [...edge].slice(0, 5).join(', '));
    if (tiny.size) r.warnings.push('Sheet ' + n + ': text below 7 pt → ' + [...tiny].slice(0, 4).join(', '));

    // Largest vertical gap with nothing in it: the "half-empty page".
    spans.sort((a, b) => a[0] - b[0]);
    let cursor = safe.top, gap = 0;
    for (const [a, b] of spans) { if (b <= a) continue; gap = Math.max(gap, a - cursor); cursor = Math.max(cursor, b); }
    gap = Math.max(gap, safe.bottom - cursor);
    const h = safe.bottom - safe.top;
    info.largestGap = Math.round(gap / h * 100);
    if (!s.hasAttribute('data-airy') && gap / h > .30)
      r.warnings.push('Sheet ' + n + ': empty gap of ' + info.largestGap + ' % (' + Math.round(gap / MM) + ' mm). Spread the content, scale it up or merge with another sheet.');

    for (const img of s.querySelectorAll('img')) if (!img.complete || !img.naturalWidth) r.errors.push('Sheet ' + n + ': image does not load → ' + (img.getAttribute('src') || '').slice(0, 60));
    r.sheets.push(info);
  });
  if (fallback.size) r.errors.push('Font did not load (the fallback font is used): ' + [...fallback].join(', '));
  return r;
})()`;

const qa = await evaluate(QA);
errors.push(...qa.errors);
warnings.push(...qa.warnings);
for (const f of fonts) if (f.status === 'error') errors.push(`Font ${f.family} failed to load.`);

// ---------------------------------------------------------------- 5. print
let pages = 0, pdfFonts = [], kb = 0;
if (qa.sheets.length) {
  const wMm = (qa.width * 25.4 / 96).toFixed(3);
  const hMm = (qa.height * 25.4 / 96).toFixed(3);
  await evaluate(`(() => { const s = document.createElement('style');
    s.textContent = '@page { size: ${wMm}mm ${hMm}mm; margin: 0 }';
    document.head.appendChild(s); })()`);

  const { data } = await cdp('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true,
    marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    displayHeaderFooter: false, scale: 1,
  }, 180000);
  const pdf = Buffer.from(data, 'base64');
  writeFileSync(PDF_OUT, pdf);
  kb = Math.round(pdf.length / 1024);

  // ------------------------------------------------------------ 6. check the PDF
  const raw = pdf.toString('latin1');
  pages = (raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  if (pages !== qa.sheets.length)
    errors.push(`The PDF has ${pages} pages and the HTML has ${qa.sheets.length} sheets. A page is missing or extra (usually something outside the sheets, or a sheet of a different size).`);
  // /FontName, not /BaseFont: /BaseFont can sit inside compressed streams.
  pdfFonts = [...new Set([...raw.matchAll(/\/FontName\s*\/(?:[A-Z]{6}\+)?([^\s/\]>]+)/g)].map(m => m[1]))];
  // Letters and digits only: "Instrument Sans" shows up in the PDF as "Instrument-Sans".
  const norm = s => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const used = [...new Set(fonts.filter(f => f.status === 'loaded').map(f => f.family))];
  for (const fam of used) {
    if (!pdfFonts.some(n => norm(n).includes(norm(fam)))) errors.push(`Font ${fam} is not embedded in the PDF.`);
  }
  // A system font in the PDF = a character the theme font does not have.
  const foreign = pdfFonts.filter(n => !used.some(f => norm(n).includes(norm(f))));
  if (foreign.length) warnings.push(`Some text uses system fonts (${foreign.join(', ')}): a symbol (⚠ ✓ ● → … emoji) is missing from the theme font. Remove it or draw it with CSS.`);

  // ------------------------------------------------------------ 7. one PNG per sheet
  if (!NO_PNG) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: Math.ceil(qa.width), height: Math.ceil(qa.height), deviceScaleFactor: SCALE, mobile: false,
    });
    await sleep(200);
    const boxes = await evaluate(`[...document.querySelectorAll('section.sheet')].map(s => {
      const b = s.getBoundingClientRect();
      return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
    })`);
    for (let i = 0; i < boxes.length; i++) {
      const c = boxes[i];
      const { data: png } = await cdp('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 },
      });
      writeFileSync(join(REVIEW, `sheet-${String(i + 1).padStart(2, '0')}.png`), Buffer.from(png, 'base64'));
    }
  }
}

ws.close();
stop();
await sleep(300);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}

// ---------------------------------------------------------------- report
const report = {
  document: HTML_IN, pdf: PDF_OUT, kb, pages, theme: themeName, browser: BROWSER, sheets: qa.sheets,
  size_mm: qa.width ? [+(qa.width * 25.4 / 96).toFixed(1), +(qa.height * 25.4 / 96).toFixed(1)] : null,
  pdf_fonts: pdfFonts, errors, warnings,
};
writeFileSync(join(REVIEW, 'qa.json'), JSON.stringify(report, null, 2));

console.log(`PDF:     ${PDF_OUT}  (${pages} pages, ${kb} KB, ${report.size_mm?.join(' × ')} mm, theme: ${themeName})`);
console.log(`Fonts:   ${pdfFonts.join(', ') || '(none)'}`);
if (!NO_PNG) console.log(`Review:  ${join(REVIEW, 'sheet-01.png')} …`);
for (const e of errors) console.log(`[ERROR] ${e}`);
for (const w of warnings) console.log(`[WARN]  ${w}`);
console.log(errors.length ? `\nDO NOT DELIVER: ${errors.length} error(s).` : `\nOK: 0 errors, ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
