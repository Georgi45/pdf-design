# Themes — the six built in, and how to use a brand you already have

A theme is **one CSS file that carries a whole design**: colour, type *and* layout. Two themes are
not the same page in two palettes — they have different margins, a different type scale, different
corners, different rules and their own ornament. Print the same document with `poster` and with
`gallery` and you get two documents that look like they came from two studios.

That is deliberate, and it has a price: **a document that fits under one theme can overflow under
another.** Change theme, print again, and read the report. If something no longer fits, the rule in
`rules.md` still holds — move content to another sheet, do not shrink the type.

## The six built-in themes

| Name | Paper | Voice | What makes it recognisable with the colour removed | Use it for |
|---|---|---|---|---|
| `poster` | limestone `#E2E2DF` | loud, volcanic. Anton + Archivo | condensed ultrabold headline at line-height .92; 9 mm corners on every block; dotted dividers; the cards are lighter than the canvas; a halftone dot field | launches, manifestos, one-pagers, anything read from across a room |
| `gallery` | pure white | silent, editorial. Plus Jakarta Sans 300 | the widest margins of the six (28 mm); a giant headline at weight 300 and line-height .78; 0 mm corners everywhere, full pills on chips only; no card chrome at all; film grain | portfolios, brand books, studio work |
| `ledger` | near-black `#181818` | precise, financial. Source Serif 4 + Inter + JetBrains Mono | the only serif + sans + mono system; every figure is monospaced and tabular; alternating table rows; a hairline instrument rail down the left edge; square badges, never pills | audits, financial reports, data reviews |
| `archive` | parchment `#E5E4E0` | institutional, museum. Archivo | **headlines and labels all in capitals**, letters pushed apart, stacked at line-height .80; a full hairline grid in tables; grid paper inside copy boxes; concentric rings behind the page | studio work, strategy, culture decks, catalogues |
| `product` | white | modern software. Geist 300 | a blurred gradient mesh on the cover sliced by a hard diagonal; the only theme with real shadows; the densest grid and the shortest type scale; figures separated by a rule and an indent, not by empty space | SaaS proposals, pricing, product decks |
| `stage` | off-black `#0E100F` | stage-lit, launch. Instrument Sans, cream ink | sections announced by `{ curly brackets }` instead of capitals; chips outlined, never filled; a binary scale — giant or small, nothing between; two hairlines edge to edge framing the page | launch notes, tech decks, release write-ups |

Pick one with `<body class="format-a4" data-theme="archive">`, or print the same file with another
one without editing it: `node scripts/print.mjs doc.html --theme=stage`.

Two of the six are dark and they are opposites: `ledger` is dense and serif, `stage` is airy and
sans. Four corner languages are in play (0 mm, 2–3 mm, 9 mm, pill) and the type ratios run from
about 4× (`product`) to about 8× (`poster`).

## Ask before you pick

Before choosing a theme, ask the user: **do you already have a style?** Three answers, three routes.

1. **"No, pick one."** → a built-in theme from the table above. Match the voice to the reader.
2. **"Yes, here it is."** → they hand over a `DESIGN.md`, a `tokens.json`, a CSS file, a web page or
   a URL. Run `brand.mjs` (below). This is the normal case for anyone with a company.
3. **"Yes, but only in my head."** → ask for the three things a theme needs: the paper colour,
   the ink colour and the one accent, plus the two typefaces. Then write the file by hand.

Never invent a brand colour silently. If you guess, say which value you guessed.

## Route 2 — turn an existing style into a theme

```
node <skill>/scripts/brand.mjs <source> [more sources] --name <slug> -o ./<slug>.css --fonts
```

Sources it reads, and you can pass several at once:

| Source | What it pulls out |
|---|---|
| `DESIGN.md` or any Markdown | hex values next to a label ("Accent: #E4572E"), named typefaces |
| `tokens.json` (DTCG) | every `$type: color` and `$type: fontFamily`, using the token path as the role hint |
| `style.css` | custom properties (`--brand-bg`) and plain declarations |
| `page.html` | inline styles, `<style>` blocks and Google Fonts links |
| `https://site` | the page plus its first six stylesheets, over plain HTTP — no browser |

Options: `--fonts` downloads the typefaces it found from Google Fonts. `--dark` forces a dark paper.
`--no-preview` skips the preview sheet. `--check <theme.css>` only audits contrast and writes nothing.

It writes two files:
- `<slug>.css` — the theme, with the same variable names as the built-in ones.
- `<slug>-preview.html` — one sheet with the whole palette, a type specimen, a table, both callouts
  and a dark block. **Print it and look at it** before you use the theme on real work:
  `node <skill>/scripts/print.mjs <slug>-preview.html`.

`brand.mjs` writes **colour and fonts only**, so the theme it produces keeps the neutral default
layout from `base.css`. That is a safe first draft, not a finished design. To give it a layout of
its own, add a `body[data-theme]` block by hand — the next section is the whole contract, and the
six built-in files are the worked examples.

Two limits worth knowing. A URL is fetched as plain HTML, so a site that paints its colours with
JavaScript gives poor results — take a `DESIGN.md` or a `tokens.json` instead. And a font that is
not on Google Fonts cannot be downloaded: drop the `.woff2` into `assets/fonts/` yourself and write
the `@font-face` by hand, or choose the nearest family that is.

## The variable contract

A theme file has two halves, and **which selector you use matters**.

```css
/* 1 · COLOUR AND FONTS → :root */
:root {
  --c-paper: #E5E4E0;  --c-ink: #1D1D1D;  --c-accent: #C2306E;
  --f-display: "Archivo", system-ui, sans-serif;
  --f-text: "Archivo", system-ui, sans-serif;
  --w-display: 400;
}

/* 2 · LAYOUT AND STRUCTURE → body[data-theme] */
body[data-theme] { --safe: 20mm; --t-display: 56pt; --radius-card: 0; --case-label: uppercase; }
body[data-theme].format-16-9 { --safe: 24mm; --t-display: 78pt; }
body[data-theme] .eyebrow::before { display: none; }
```

Why the second selector is not `:root`: `base.css` sets the scale on `:root` but the format classes
(`body.format-16-9`, `body.format-a4-landscape`) override it on `body`. A `:root` block would lose
to them. `body[data-theme]` has the same weight as a format class and is injected after it, so it
wins — and it matches both a built-in name and `data-theme="./brand.css"`. `print.mjs` guarantees
the attribute is on `<body>`, even when you print with `--theme=`.

**A theme that sets a format-sensitive token must set it for every format it supports.** If you
write `--safe` or any `--t-*` in `body[data-theme]`, add a `body[data-theme].format-16-9` block
too, or 16:9 documents will print at A4 sizes.

### Colour (in `:root`)

| Variable | What it paints | Rule |
|---|---|---|
| `--c-paper` | the sheet background | the one colour the reader sees most |
| `--c-surface` | panels and table fills | usually `paper` nudged toward the ink — but `poster` makes it *lighter*, which is the whole figure/ground trick |
| `--c-ink` | body text and headlines | 8:1 or more against `paper` |
| `--c-muted` | secondary text, captions, the foot | 4.5:1 or more against `paper` |
| `--c-line` | hairlines, table rules, borders | visible but quiet: never as dark as the ink |
| `--c-dark` | dark blocks and `sheet--dark` | 8:1 or more against `--c-light` |
| `--c-light` | text sitting on `--c-dark` | usually the paper, or near it |
| `--c-accent` | the one word, row or figure that matters | 3:1 on paper **and** 3:1 on `--c-dark` |
| `--c-accent-deep` | accent used as running text | 4.5:1 on paper |
| `--c-accent-soft` | the fill behind an accent callout | ink must stay 4.5:1 on it |
| `--c-bad` / `--c-bad-soft` | risk only | 4.5:1 on paper |
| `--c-good` / `--c-good-soft` | confirmation only | 4.5:1 on paper |
| `--f-display` | headlines, big figures | the character of the brand lives here |
| `--f-text` | everything read in paragraphs | boring is correct |
| `--w-display` | the weight headlines use | never fake a bold the font does not have |

One accent. If everything is accent, nothing is. A theme may also have no hue at all: `gallery`
sets its accent to graphite on purpose, and lets weight and position carry the emphasis.

### Layout (in `body[data-theme]`)

Every one of these already has a neutral default in `base.css`. Set only the ones your design needs.

| Variable | What it controls | Default |
|---|---|---|
| `--safe` | the margin on all four sides; text never goes past it | 16 mm A4 |
| `--gap` | the standard space between blocks | 6 mm |
| `--t-small` … `--t-giant` | the whole type scale. The distance between `--t-text` and `--t-display` is what makes a theme feel editorial or feel like an interface | see `base.css` |
| `--lh-display` / `--track-display` | line-height and tracking for `h1`–`h4` | 1.06 / −.018em |
| `--lh-hero` / `--track-hero` | the same for `.display` and `.quote`; `--lh-giant` for `.giant` | 1 / −.028em / .82 |
| `--measure` | the comfortable line length of `.measure` | 125 mm |
| `--radius-card` / `--radius-pill` | corners on blocks and on chips | 1.5 mm / 99 px |
| `--hair` / `--rule` / `--rule-strong` | the three line weights the whole sheet uses | .25 / .5 / .6 mm |
| `--shadow-card` | depth on callouts and copy boxes | `none` |
| `--w-text` / `--w-bold` / `--w-label` | weights for body, `<b>`, and micro-labels | 400 / 700 / 700 |
| `--f-label` | the family used by eyebrows, table heads and chips | `var(--f-text)` |
| `--case-label` | `uppercase` or `none` for every micro-label | `uppercase` |
| `--track-label` / `--track-th` / `--track-chip` / `--track-callout` | tracking for the eyebrow, table heads, chips and callout titles | .22 / .12 / .08 / .14 em |
| `--marker-w` | width of the dash before an `.eyebrow` | 7 mm |
| `--stat-border` | the rule that opens a `.stat` | `var(--rule) solid currentColor` |
| `--callout-edge` | the left edge of a callout and a copy box | `1mm solid var(--c-accent)` |
| `--steps-col` | the number column in `.steps` | 14 mm |
| `--quote-mark` | the character `.quote` opens with; `""` removes it | `"“"` |

### Structure rules

Below the token blocks a theme may write real CSS, prefixed with `body[data-theme]`, to reshape
components: make the eyebrow a pill (`poster`), wrap it in brackets (`stage`), turn `.stat` into a
filled card (`poster`) or into a left-ruled column (`product`), strip every box down to a rule
(`gallery`, `stage`), or draw a hairline grid through a table (`archive`).

**Ornament goes in a pseudo-element on `.sheet`, and nothing else.** `.sheet::before` and
`.sheet::after` are not in the DOM, so the quality check never measures them, and `.sheet` already
clips them with `overflow: hidden`. Use CSS gradients — no image files. The six built-in themes
draw a halftone field, film grain, an instrument rail, concentric rings, a gradient mesh with a
diagonal cut and two edge-to-edge hairlines that way.

## Checking a theme

```
node <skill>/scripts/brand.mjs --check ./my-theme.css
```

Twelve pairs, each with a target ratio. It exits non-zero if any pair fails, so it works in a
script. Targets are stricter than the WCAG minimum on purpose: print has no backlight, and a
report gets photocopied.

Contrast is the floor, not the goal. Print the theme and look at it. Two questions worth asking:

- **Does it fill the page?** A theme with a short type scale on a document written for a long one
  leaves dead space. Raise the scale, or use a theme that matches the document's density.
- **Would you know which theme it is in black and white?** If the answer is only "by the colour",
  the theme has a palette but not a design.
