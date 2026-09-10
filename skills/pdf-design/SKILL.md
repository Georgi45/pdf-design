---
name: pdf-design
description: Makes PDFs that look designed, not like a printed website — client reports, proposals, one-pagers, dossiers and slide decks where every page is composed as a whole, full-bleed, with no white frame and no half-empty pages (A4 portrait, A4 landscape or 16:9). Text stays vector and selectable, brand themes are built in, and an automatic quality check measures every page and renders a PNG of each one so the agent can review its own work before delivering. Use when the user asks for a PDF, a report, a proposal, a deck or presentation as PDF, a brochure, a one-pager, "make this look professional", or says the PDF "looks like a web page".
license: MIT
compatibility: Needs Node.js 22+ and Chrome, Chromium or Edge. Works in Claude Code, Codex, Cursor, Gemini CLI and any agent with a terminal. Experimental in claude.ai.
---

# pdf-design — PDFs with designed pages

Goal: a PDF that looks like it came out of a layout program, not a printed web page.
**Every sheet is designed as a whole. Nothing flows from one sheet to the next.**

## Files in this skill

Paths are relative to the folder that contains this `SKILL.md`.

| File | What for |
|---|---|
| `references/rules.md` | Print design rules and how much fits on a sheet. **Read before planning.** |
| `references/page-types.md` | Catalogue of sheet layouts and components, with HTML. |
| `assets/base.css` | The sheet engine and components. Never edited per document. |
| `assets/themes/*.css` | `editorial` (default), `warm`, `dark`. Colours and fonts only. |
| `scripts/print.mjs` | HTML → PDF, quality check and one PNG per sheet. |
| `scripts/fonts.mjs` | Downloads a Google Font for a new theme. |

Complete examples live in the repository's `examples/` folder (`report-a4.html`, `deck-16-9.html`).

## Workflow

### 1. Brief
Take what the conversation already says; ask only what is missing:
- What the document is, who reads it, and what it must make them do (decide, sign, act).
- Format: **A4 portrait** for reports that are read. **16:9** (or A4 landscape) for proposals shown on a screen.
- Theme: a built-in one, or the user's brand. For a brand, copy `assets/themes/editorial.css` next to the document, change colours and fonts (`node scripts/fonts.mjs "Family:axes"`), keep the variable names.

### 2. Sheet plan — show it to the user before building

| Sheet | Type | Headline (the conclusion) | Content | Layout |
|---|---|---|---|---|
| 1 | cover | … | … | dark, title at the bottom |

- One idea per sheet. The headline states the conclusion, not the topic: "Instagram brings the people. The website loses them.", not "Channels".
- Check that it fits with the "How much fits" table in `rules.md`. If it does not fit, it is two sheets.
- If a sheet is short, merge it with another or make its content bigger. Never leave half a page empty.

### 3. Build
- Put the document where the user works: `<project>/documents/<name>.html`.
- `<body class="format-a4" data-theme="warm">` — formats: `format-a4`, `format-a4-landscape`, `format-16-9`. Themes: a built-in name or a path relative to the document (`data-theme="./brand.css"`).
- No `<link>` to the skill is needed: `print.mjs` injects `base.css` and the theme. The document's own `<style>` goes in `<head>` and uses the theme variables (`--c-*`, `--f-*`).
- One `<section class="sheet">` per page, with `head` · `content` · `foot`. Layouts in `page-types.md`.
- Logos: `<!-- include: logo.svg -->` pastes an SVG sprite at print time.
- Not allowed: Google Fonts by URL, content outside the sheets, and the symbols ⚠ ✓ ● → … or emoji (the theme fonts do not have them).

### 4. Print and review

```
node <this-skill-folder>/scripts/print.mjs <document.html>
```

- `[ERROR]` → do not deliver. Fix and print again.
- `[WARN]` → fix it, or justify it (for example `data-airy` on a cover).
- **Look at every PNG** in `<document>-review/`. The script cannot judge aesthetics: balance, hierarchy, uneven gaps, contrast. Review questions: `rules.md`, section 10.
- Repeat until there are 0 errors and every sheet could sit in a magazine.
- To preview in a browser, open `<document>-review/_printed.html` (the self-contained copy).

### 5. Deliver
One line with the path of the PDF (it sits next to the HTML). The `-review` folder is a working folder, not a deliverable.

## Never
- Print a "web page" HTML with `@page { margin: … }`: that is exactly the white frame this skill removes.
- Shrink the type to make something fit. Move it to another sheet.
- Paste screenshots into the PDF. Text must stay selectable.
- Use `content--spread` with blocks of very different weight: it leaves uneven gaps.
