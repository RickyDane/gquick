# Code Review Summary: LaTeX Mathematical Notations Rendering

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-07-30  
**Status:** Needs Changes  

## Overall Assessment

The addition of LaTeX math rendering via `remark-math` and `rehype-katex` to `MarkdownMessage.tsx` is clean and straightforward. Type checking (`tsc`) and Vite production build both pass without compilation errors. KaTeX fonts and CSS assets are bundled properly.

However, there are **two major issues** requiring attention before merge:
1. Currency values with dollar signs (e.g., `$5 and $10`) in standard text messages are incorrectly parsed as inline math formulas, corrupting normal chat text.
2. The CSS rule `overflow-y: hidden` on `.katex-display` clips tall display math symbols (summations, matrices, fractions).

Additionally, three minor issues regarding dependency duplication, bundle chunk size, and dark mode error styling were identified.

---

## Critical Issues (0)
None.

## Major Issues (2)
- **#F-001:** Single dollar currency formatting (`$5 ... $10`) is parsed as inline math by `remark-math`, breaking regular chat text display.
- **#F-002:** `overflow-y: hidden` on `.katex-display` in `src/index.css` visually clips top and bottom bounds of tall math expressions.

## Minor Issues (3)
- **#F-003:** Duplicate `katex` package instances in `package-lock.json` (`0.18.1` root vs `0.16.47` nested) and mismatched `@types/katex` version.
- **#F-004:** Static KaTeX imports inflate main bundle chunk size to ~716 kB, exceeding Vite's 500 kB chunk threshold warning.
- **#F-005:** Missing dark mode styling override for `.katex-error` output.

---

## Positive Findings
- **Clean Integration:** `remarkMath` and `rehypeKatex` are added cleanly to `ReactMarkdown` in `MarkdownMessage.tsx`.
- **Proper CSS Import:** KaTeX stylesheet (`katex/dist/katex.min.css`) is imported correctly.
- **Compilation Success:** TypeScript build (`tsc`) and Vite bundling pass cleanly.
- **Font Asset Handling:** Vite successfully resolves and emits KaTeX web fonts to `dist/assets/`.

---

## Recommendation

**Needs Changes.** Fix **#F-001** (dollar sign currency parsing) and **#F-002** (display math vertical clipping) before merging. Address **#F-003**, **#F-004**, and **#F-005** for dependency hygiene and visual polish.
