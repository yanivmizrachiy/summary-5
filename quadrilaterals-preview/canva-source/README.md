# Canva canonical sources for Claude Code

This folder is the source-of-truth bridge from the user's Canva designs into this repository.

## Canonical designs
- Rectangle / מלבן — Canva design `DAGlS_3_YFA`
- Rhombus / מעויין — Canva design `DAGlPGPc5sM`

## Durable visual source
Claude Code MUST inspect the PNG files in:
- `rectangle/page-1.png` … `rectangle/page-5.png`
- `rhombus/page-1.png` … `rhombus/page-5.png`

These PNGs were captured directly from the user's Canva designs and committed to GitHub so Claude does not need Canva account access.

## Exact text source
Read `manifest.json`. It contains the Canva design IDs, page IDs, canonical page size (794×1123), page mapping, and exact rich-text extraction from Canva.

## Hard rules
1. The PNGs are source-of-truth, not inspiration.
2. Do not rewrite wording, fill blanks, change order, or invent answers.
3. Preserve RTL Hebrew and LTR mathematics exactly.
4. Improve website rendering only after comparing each website page against its matching Canva PNG and manifest entry.
5. If the website and source disagree, the Canva snapshot + manifest win.
6. Do not edit Canva from Claude Code.
7. Rectangle and rhombus must be visually and textually audited page-by-page before claiming fidelity.
