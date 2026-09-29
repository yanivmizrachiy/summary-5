# Canva canonical sources for Claude Code

This folder is the source-of-truth bridge from the user's Canva designs into this repository **for the designs actually captured here**. See `../SSOT.md` for the authority hierarchy and provenance rules for all 20 worksheets.

## Canonical designs verified
- Parallelogram / מקבילית — Canva design `DAHWZm8MckE` — 5 pages — ID/page/text provenance registered in `manifest.json`
- Rectangle / מלבן — Canva design `DAGlS_3_YFA` — 5 pages — committed PNGs + manifest
- Rhombus / מעויין — Canva design `DAGlPGPc5sM` — 5 pages — committed PNGs + manifest
- Square / ריבוע — Canva design `DAHWZrMtYEc` — 5 pages — ID/page/text provenance registered in `manifest.json`

All 20 pages now have verified Canva design provenance. Rectangle/rhombus have durable local PNG snapshots; parallelogram/square still need durable local snapshots for offline visual comparison.

## Durable visual source
Claude Code MUST inspect the PNG files in:
- `rectangle/page-1.png` … `rectangle/page-5.png`
- `rhombus/page-1.png` … `rhombus/page-5.png`

These PNGs were captured directly from the user's Canva designs and committed to GitHub so agents do not need Canva account access for those pages.

## Exact text source
Read `manifest.json`. It contains the captured Canva design IDs, page IDs, canonical page size (794×1123), page mapping, and exact rich-text extraction.

## Hard rules
1. The committed PNGs are source-of-truth, not inspiration.
2. Do not rewrite wording, fill blanks, change order, or invent answers.
3. Preserve RTL Hebrew and LTR mathematics exactly.
4. Improve website rendering only after comparing each source-backed website page against its matching Canva PNG and manifest entry.
5. If a source-backed website page and its source disagree, the Canva snapshot + manifest win unless a later explicit user instruction intentionally overrides that exact content.
6. Do not edit Canva from Claude Code.
7. Rectangle and rhombus must be visually and textually audited page-by-page before claiming fidelity.
8. A blank is student work. Never convert it into a solved relation merely to make a diagram or derivation look complete.
9. Never generalize the 10 captured pages into a claim that all 20 pages are Canva-verified.
