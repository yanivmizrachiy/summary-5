# Quadrilaterals SSOT contract

This document defines authority for `quadrilaterals-preview`. It prevents source fidelity, later user-directed presentation improvements, and implementation details from being conflated.

## Authority order

1. **Canonical Canva source package, when present** — page PNG + `canva-source/manifest.json` control wording, blanks, content order, and didactic intent.
2. **Explicit later user-directed presentation rules already encoded in the implementation/QA** — e.g. black textbook styling, numbered properties, double implication arrows. These may improve presentation but MUST NOT fill a Canva blank, rewrite source wording, invent an answer, or change the mathematical meaning.
3. **`quadrilaterals-preview/index.html`** — executable implementation of the 20 worksheet pages.
4. **`quadrilaterals-preview/qa/`** — executable invariants and regression protection. QA validates the implementation; it is not a source from which new worksheet content may be invented.

When authorities conflict on source content, a canonical Canva snapshot+manifest wins unless a later explicit user instruction intentionally overrides that exact content.

## Provenance status

- **Rectangle / מלבן — 5/5 pages:** canonical Canva PNGs + manifest metadata are present.
- **Rhombus / מעויין — 5/5 pages:** canonical Canva PNGs + manifest metadata are present.
- **Parallelogram / מקבילית — 5 pages implemented:** no equivalent canonical PNG+manifest package is currently stored under `canva-source/`.
- **Square / ריבוע — 5 pages implemented:** no equivalent canonical PNG+manifest package is currently stored under `canva-source/`.

Therefore CI/QA may claim **20 implemented/validated worksheet pages**, but MUST NOT claim **20/20 Canva-fidelity-verified pages** until canonical source packages for parallelogram and square are committed and audited.

## Completion-field invariant

A blank in a canonical source is student work. Rendering code, refactors, agents, and QA must not silently replace it with a solved statement. In particular, mathematical labels or relations may be rendered only when they are immutable source content or an explicit later user instruction requires them.

## Branch integration rule

`claude/quadrilaterals-max-quality` is the current integration branch for PR #1. The historical `codex/quadrilaterals-a4-fix` branch contains useful A4/source-fidelity work, but it is not an independent SSOT. Reuse from it must be selective and must preserve this contract and pass the canonical QA.

## Definition of done

A change is not complete merely because it renders. It must preserve source content, pass the browser/geometry/print/mobile/content-lock QA, avoid clipping/overflow, preserve A4 composition, and keep the provenance claim accurate.
