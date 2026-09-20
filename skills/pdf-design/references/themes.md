# Themes — the six built in, and how to use a brand you already have

A theme is **one small CSS file**: colours and fonts, nothing else. It never changes the layout.
The same document printed with a different theme keeps every margin, every size and every page break.

## The six built-in themes

| Name | Paper | Voice | Use it for |
|---|---|---|---|
| `editorial` | warm off-white | calm, bookish. Instrument Serif + Instrument Sans | the default. Reports that get read end to end |
| `warm` | cream | friendly, premium. Fraunces + Instrument Sans | client proposals, hospitality, food, wellness |
| `dark` | near-black | product / tech. Geist, electric lime | decks, launch notes, technical proposals |
| `corporate` | white | sober, institutional. Source Serif 4 + Inter | consultancy, finance, B2B, anything read by a committee |
| `mono` | near-white | precise, engineering. JetBrains Mono + Inter | specs, audits, architecture notes, technical reviews |
| `press` | pure white | urgent, high contrast. Fraunces 800 + Inter, red accent | investigations, manifestos, launch announcements |

Pick one with `<body class="format-a4" data-theme="corporate">`.

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

Read the report it prints. It tells you which colour came from which token, which values it had to
move to keep text readable, and which typefaces are still missing. **It is a first draft, not a
verdict.** Fix any value by hand, then re-run `--check`.

Two limits worth knowing. A URL is fetched as plain HTML, so a site that paints its colours with
JavaScript gives poor results — take a `DESIGN.md` or a `tokens.json` instead. And a font that is
not on Google Fonts cannot be downloaded: drop the `.woff2` into `assets/fonts/` yourself and write
the `@font-face` by hand, or choose the nearest family that is.

## The variable contract

Every theme sets exactly these. Keep the names; change only the values.

| Variable | What it paints | Rule |
|---|---|---|
| `--c-paper` | the sheet background | the one colour the reader sees most |
| `--c-surface` | panels and table fills | `paper` nudged 3–6 % toward the ink |
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

One accent. If everything is accent, nothing is.

Below the `:root` block a theme may add a few rules of its own — letter-spacing for a tight
grotesque, uppercase eyebrows, a heavier table header. Look at `dark.css`, `mono.css` and
`press.css` for the pattern. Anything more than that belongs in the document, not in the theme.

## Checking a theme

```
node <skill>/scripts/brand.mjs --check ./my-theme.css
```

Twelve pairs, each with a target ratio. It exits non-zero if any pair fails, so it works in a
script. Targets are stricter than the WCAG minimum on purpose: print has no backlight, and a
report gets photocopied.

Contrast is the floor, not the goal. The preview sheet is where you judge whether the thing has a
voice. A theme that passes every ratio and still looks like a tax form is a theme that failed.
