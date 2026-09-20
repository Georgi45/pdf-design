# Sheet types

Everything uses classes from `assets/base.css`; colours, fonts, margins and the type scale all come from the theme.
Complete documents to copy from, in the repository's `examples/`:
- A4 report, `product` theme: `examples/report-a4.html`
- 16:9 deck, `stage` theme: `examples/deck-16-9.html`

Colours and fonts are not here: they live in the theme. Six are built in and any brand you
already have can become one — see `themes.md`.

## Document skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Document title</title>
<style> /* this document's own pieces, using --c-* and --f-* */ </style>
</head>
<body class="format-a4" data-theme="archive">
<!-- include: logo.svg -->          (optional: an SVG sprite with <symbol id="logo">)
<section class="sheet">…</section>
</body>
</html>
```

With a sprite included, `<svg class="logo" viewBox="…"><use href="#logo"/></svg>` inherits the text colour.

Head and foot of a content sheet:

```html
<header class="head">
  <span class="brand">Studio name</span>
  <span class="muted">Short document title</span>
</header>
…
<footer class="foot"><span class="muted">Studio · Report for Client</span><span class="folio"></span></footer>
```

## Types

### cover — always sheet 1
```html
<section class="sheet sheet--dark" data-airy>
  <div class="glow" data-deco></div>
  <header class="head">brand · "for Client"</header>
  <div class="content content--bottom">
    <div class="eyebrow">Quarterly report · October 2026</div>
    <h1 class="display" style="font-size:46pt">Headline<br><span class="accent">key phrase</span></h1>
    <p class="lead muted measure">One or two lines of summary.</p>
  </div>
  <hr class="hairline">
  <footer class="foot">Prepared for … · contact</footer>
</section>
```
With a photo: first children `<img class="bleed-photo" data-deco src="photo.jpg">` and `<div class="scrim" data-deco></div>`.
Giant background symbol: `<div class="bg-number accent" data-deco style="font-size:300pt;top:-12mm;bottom:auto">Q3</div>`.

### contents — documents longer than 8 sheets
Grid: `span-4` (title) + `span-8 to-bottom` with a numbered list. See `deck-16-9.html`, sheet 2.

### divider — opens each part of a long document
`sheet--accent` or `sheet--dark`, `data-airy`, `content--bottom`, eyebrow "Part 01" + a big `display`,
and the part number in `.bg-number` with `data-deco`. See `deck-16-9.html`, sheet 3.

### numbers — when a few figures tell the story
```html
<div class="grid">
  <div class="span-4 stat"><span class="number">4.1 s</span><span class="caption">what it means, in one sentence.</span></div>
  … (2, 3 or 4 stats: span-6, span-4, span-3)
</div>
```
A risk figure: `style="border-color:var(--c-bad)"` on the `.stat`.

### table or comparison
```html
<table class="table">
  <tr><th style="width:36mm">Option</th><th>…</th></tr>
  <tr class="highlight"><td><b>Recommended</b></td><td class="tabular">$2,400</td><td><span class="chip chip--good">Yes</span></td></tr>
  <tr class="dim"><td>Discarded</td>…</tr>
</table>
```
`table--dark` gives a dark header row. Column widths in mm; the rest is shared out.
Below the table, the reasons for the recommendation in 3 columns (`span-4`, each an `h3` + a `.muted` paragraph).

### two columns of text
`grid` with two `span-6`, each with an opening eyebrow, an `h3` and 2 paragraphs.
There are deliberately no newspaper columns (text jumping from one column to the next): two titled blocks read better.

### plan or steps
```html
<ol class="steps">
  <li><div><span class="step-title">Step</span><span class="step-text">One or two lines.</span></div></li>
</ol>
```
Horizontal (16:9): `class="steps steps--row"`, 3 to 5 steps.

### highlight — the sentence nobody should forget
A dark band inside a light sheet:
```html
<div class="dark" style="padding:10mm 11mm">
  <span class="eyebrow">The rule</span>
  <p style="font-family:var(--f-display);font-size:26pt;line-height:1.12">Sentence. <span class="accent">Punchline.</span></p>
</div>
```
Or a whole sheet: `sheet--soft` + `content--center` + `<blockquote class="quote">`. See `deck-16-9.html`, sheet 7.

### callouts
`<div class="callout callout--bad">` (risk), `callout--good` (confirmation) or `callout` (accent).
Inside: `<span class="callout-title">What to understand</span><p>…</p>`. No ⚠ or ✓: the colour already says it.
Two callouts side by side: inside a `grid grid--stretch`, one `span-6` each.

### text to copy — emails, literal messages
`<div class="copy-box">` with an eyebrow, a subject line and `<div class="copy-text">` (keeps line breaks).

### closing — always the last sheet
`sheet--dark`, `data-airy`, `content--center`: a headline with the next step, 2 numbers with the key dates,
and the contact details in the foot.

## Loose components

| Class | What it is |
|---|---|
| `eyebrow` / `eyebrow--plain` | Small caps label above a headline, with or without a dash |
| `display`, `giant`, `lead`, `small` | Type sizes |
| `muted`, `accent` | Secondary and accent colour |
| `measure` | Comfortable reading width (125 mm) |
| `rule`, `hairline` | Short accent bar / full-width thin line |
| `grid` + `span-2 … span-12` | 12-column grid |
| `grow`, `to-bottom` | Take the leftover height / align to the bottom of a grid cell |
| `dark` | Dark block inside a light sheet |
| `chip--good`, `chip--bad`, `chip--accent` | Pill labels for tables |
| `list` | List with accent dashes |
| `glow`, `bleed-photo`, `scrim`, `bg-number` | Full-bleed decoration (always with `data-deco`) |
