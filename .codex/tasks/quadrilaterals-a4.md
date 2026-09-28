# Codex task: rebuild the first quadrilaterals A4 page professionally

You are editing **only** `quadrilaterals-preview/index.html`.

## Goal
Repair the first parallelogram worksheet page so it is a compact, professional Hebrew mathematics textbook/worksheet A4 page and remains source-faithful to the original Canva worksheet.

Do not redesign it as a web card system. It must look like a printed workbook page.

## Non-negotiable source fidelity
Do **not** rewrite, paraphrase, explain, solve, or add prose.

The visible Hebrew wording on page 1 must be exactly based on these original Canva text elements:

- `מקבילית`
- `הגדרה: מקבילית הוא מרובע בעל שני זוגות של צלעות נגדיות ________ זו לזו.`
- `:הוא מקבילית ABCD המרובע ` in the raw Canva RTL extraction; render this correctly to the human reader as the same original sentence with `ABCD` isolated LTR, without changing its wording.
- `תכונות המקבילית:`
- `במקבילית כל זוג צלעות _______ מקבילות זו לזו (לפי ההגדרה). `
- ` מקבילית ABCD `
- `וגם`
- blank completion fields from Canva
- `במקבילית כל שתי _______ נגדיות שוות זו לזו. `
- ` מקבילית ABCD `
- `וגם`
- blank completion fields
- `=` signs only where the Canva source has them

Important: the source page is a **completion worksheet**. Do not fill missing answers.
In particular, do not render solved statements such as `AB ∥ CD`, `AD ∥ BC`, `AB = CD`, or `AD = BC` unless the original source explicitly provided those letters as immutable content. The current implementation accidentally solved some blanks; remove that behavior.

## Original Canva geometry / source metadata
Canvas: 794 x 1123 px (A4 portrait ratio).

Important page-1 source element positions (for understanding relative hierarchy, not for blindly using absolute positioning):
- title around y=25, height ~78
- definition around y=162
- "ABCD ... מקבילית" line around y=203
- first main diagram around x=61, y=267, w=262, h=150
- first completion/math region around y=290
- "תכונות המקבילית:" around y=442
- first property sentence around y=566
- property diagram around x=131, y=608, w=183, h=105
- its completion region around y=748
- second property sentence around y=869
- second property diagram around x=142, y=926, w=184, h=83
- its completion/equality region around y=1025–1058

Use this only to preserve content order and proportions. Do not recreate the broken absolute-position layout.

## Design requirements
- A4 portrait: exactly 794×1123 CSS px on screen and 210×297 mm in print.
- Mobile: scale the full A4 canvas; **never reflow the worksheet into a mobile layout**.
- Hebrew RTL must never be clipped or reversed.
- Math Latin tokens must use `bdi dir="ltr"` or equivalent bidi isolation.
- Use a dedicated math font stack (Cambria Math / STIX Two Math / Times New Roman) for mathematical notation.
- Do not use MathML if it produces browser-dependent spacing problems for simple worksheet labels; clean semantic HTML/SVG is acceptable.
- Use vector SVG for the parallelogram and geometric marks.
- Diagram labels A,B,C,D must be legible and not collide with edges.
- Parallel/equality markings must be mathematically correct.
- The first page should use almost all useful A4 space, but not feel oversized.
- Remove decorative boxes, giant headings, excessive gaps, shadows, gradients, and rounded cards from the printed page.
- Keep page hierarchy: title → definition/first diagram+completion → properties heading → property 1 diagram+completion → property 2 diagram+completion.
- No invented numbered badges.
- No invented "שאלות מתוך תוכנית הלימודים".
- No footer prose; page number alone is fine if already present.

## Robust layout
Avoid fragile absolute coordinates for normal text. Prefer CSS Grid/Flex with explicit rows.
Use `min-width:0`, `overflow-wrap:normal`, and bidi isolation where needed.
Blanks should be CSS underline fields, not underscore characters, except the literal source wording may be represented visually by equivalent blank lines.

## Automated acceptance checks
Add or keep a small validation script/function if useful, but do not expose debug UI.

At minimum verify:
1. JavaScript parses.
2. There are still 20 worksheet pages total.
3. First page is exactly 794×1123 CSS px.
4. No first-page content element extends outside the A4 sheet bounding box.
5. No first-page text node has horizontal clipping/overflow.
6. No solved `AB ∥ CD` or `AD ∥ BC` appears in page-1 HTML.
7. All required source phrases above are still present.
8. Print CSS uses `@page { size: A4 portrait; margin: 0; }`.
9. Mobile preserves A4 composition by scale/transform, not reflow.
10. Do not modify wording on pages 2–20.

If Chrome/Chromium is available on the runner, run a headless render at:
- desktop viewport at least 900×1300
- mobile viewport 390×844
and programmatically inspect bounding boxes for the first sheet. Screenshot to /tmp only, not the repository.

## Scope
Touch only `quadrilaterals-preview/index.html`.
Do not add dependencies, package managers, generated files, reports, screenshots, or new app architecture.
Do not touch Canva.
Do not alter GitHub workflows.
Do not edit any other worksheet wording.

Make the edit, validate it, and leave the file ready for commit.
