# AGENTS.md

This repository is an Agent Skill: **pdf-design**, at `skills/pdf-design/SKILL.md`.

When the user asks for a PDF, a report, a proposal, a one-pager or a slide deck as PDF:
1. Read `skills/pdf-design/SKILL.md` and follow its workflow.
2. Read `skills/pdf-design/references/rules.md` before planning the sheets.
3. Print with `node skills/pdf-design/scripts/print.mjs <document.html>` and look at every PNG it writes.

Requirements: Node.js 22+ and Chrome, Chromium or Edge (or `CHROME_PATH`).

To install the skill for your agent, copy `skills/pdf-design/` into its skills folder
(for example `~/.claude/skills/`, `~/.agents/skills/` or `.agents/skills/` in a project).
