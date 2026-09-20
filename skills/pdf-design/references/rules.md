# Print design rules

What separates a laid-out document from a printed web page. Read before the sheet plan.

## 1. The sheet is the unit, not the scroll
- Each `<section class="sheet">` is exactly one page and clips whatever does not fit.
- The background belongs to the sheet (`sheet--dark`, `sheet--accent`, `sheet--soft` or the theme paper). Never to `body`.
- There is no "continued on the next page". If it does not fit, it becomes two sheets, each with its own headline.

## 2. Safe area
- All text stays inside the sheet `padding` (`--safe`). The default is 16 mm on A4, 15 mm on A4 landscape and 18 mm on 16:9, but **the theme sets it**: `product` uses 14 mm, `gallery` uses 28 mm.
- Only these touch the edge: backgrounds, bleed photos (`.bleed-photo`), glows and background numbers. They carry `data-deco`, and the quality check ignores them.
- A content block that bleeds on purpose carries `data-bleed`.

## 3. Structure of a sheet
`head` (brand + short document title) · `content` · `foot` (signature + `folio`, which numbers itself).
Vertical position of the content:
- `content--bottom` → covers and dividers: the title sits low.
- `content--center` → quote and closing.
- `content--spread` → content sheets: spreads the air between 3 or 4 blocks of similar weight.

A typical content sheet: eyebrow (`01 · Section`) + `display` headline with the conclusion + content.

## 4. Hierarchy: few sizes, far apart

The table below is the DEFAULT scale. Every theme replaces it, and the gap between text and headline
is part of what makes each theme recognisable: `product` runs about 4x, `poster` about 8x. Read the
actual values in the theme file before planning how much fits.

| Piece | A4 | 16:9 |
|---|---|---|
| eyebrow, foot | 7.5 pt | 9 pt |
| text | 9.5 pt | 13 pt |
| lead | 12.5 pt | 17 pt |
| h3 | 12 pt | 15 pt |
| display (sheet headline) | 44 pt | 58 pt |
| number | 56 pt | 80 pt |

- Absolute minimum: 7 pt. The check warns below it.
- The big jump between text and headline is deliberate: it is what makes it look editorial.

## 5. One idea per sheet, and fill it
- Little content? Make it bigger: large numbers, a roomier table, `lead` text. Do not leave dead space at the bottom.
- The check warns when a vertical gap is over 30 % of the sheet. `data-airy` only on cover, divider, quote and closing.
- If one number sums up the sheet, it goes in `.number`, not buried in a paragraph.

## 6. Covers, dividers and closing
- 90 % image, 10 % text. Full-bleed dark or accent background, a large title low on the left, and one big decorative element (glow, number or symbol with `data-deco`).
- The closing sheet repeats the essentials (dates, next step) and the contact details.

## 7. Colour
- Paper + ink + one accent. The accent marks what matters: one word of the headline, the recommended row, the key number. If everything is accent, nothing is.
- Secondary text uses `.muted`. Inside a dark block use `.dark` (or `.sheet--dark`), so `.muted`, `.accent` and `.eyebrow` switch colour on their own and keep their contrast.
- `--c-bad` and `--c-good` only for risk and confirmation.

## 8. Type
- Only the two theme fonts, embedded. If a system font appears in the PDF, the check warns: some symbol is missing from the font.
- A headline longer than 3 lines is too long: shorten it.
- Line length: `.measure` (125 mm) or grid columns. Never one paragraph across a full 16:9 sheet.

## 9. How much fits (A4)
Usable area 178 × 265 mm. With head and foot ~245 mm remain; with eyebrow and headline, ~195 mm.

| Piece | Approximate height |
|---|---|
| Eyebrow + 2-line display headline | 45 mm |
| One line of 9.5 pt text | 5 mm |
| Table row (1 line / 2 lines) | 10 / 14 mm |
| 3-line callout | 25 mm |
| 2-line item of `.steps` | 17 mm |
| `.stat` block with a 56 pt number | 35 mm |

If the total goes over ~195 mm, it is two sheets. On 16:9 the usable area is ~302 × 154 mm: less height, more width → lay things out in columns.

## 10. Review by eye, on every PNG
- Can you get the sheet by reading only its headline?
- Does any gap look like a mistake rather than a decision?
- Is any text cut off, overlapping or low on contrast?
- Do all sheets look like one family (same head, foot and margins)?
- Would the cover work on its own as a poster?
