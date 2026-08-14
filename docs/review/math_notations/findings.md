# Code Review Findings: LaTeX Mathematical Notations in MarkdownMessage

## [F-001] Single Dollar Currency Syntax Misinterpreted as Math

**Severity:** Major
**Location:** `src/components/MarkdownMessage.tsx:14`

### Description
`remark-math` enables single-dollar (`$inline$`) parsing by default. In chat messages, assistant responses, or notes, single dollar signs are frequently used to express currency values or prices (e.g., `"Item A costs $5 and Item B costs $10"` or `"Total $50"`).

`remark-math` parses text enclosed between two single dollar signs on the same line (e.g., `$5 and Item B costs $`) as inline LaTeX math, and `rehype-katex` attempts to render it as a mathematical formula.

### Evidence
```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[[rehypeKatex, { strict: false }]]}
  ...
```

For input:
`"Price ranges from $5 to $10 per unit."`

Output:
`5 to ` is rendered as an inline KaTeX math formula (`5to`), altering text formatting and destroying price representations.

### Impact
Normal plain-text messages containing multiple dollar signs will render mangled text and broken formatting in the chat view.

### Recommendation
Configure `remark-math` or pass options to restrict single-dollar math parsing, or configure `singleDollarTextMath: false` if supported by plugin options:
```tsx
remarkPlugins={[
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }]
]}
```
If single-dollar inline math is required, require strict escaping (`\$5`) for currency or ensure dollar signs followed immediately by numbers are ignored.

---

## [F-002] Vertical Clipping in Display Math Container (`.katex-display`)

**Severity:** Major
**Location:** `src/index.css:40-45`

### Description
The CSS added to `src/index.css` sets `overflow-y: hidden` on display math elements:

```css
.katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0;
  margin: 0.5em 0 !important;
}
```

Display equations containing tall mathematical expressions (such as matrices, summations with upper/lower bounds like `\sum_{i=1}^{n}`, fractions, or large brackets `\left[ \frac{a}{b} \right]`) often exceed standard line height bounds. Combining `overflow-y: hidden` with minimal vertical padding (`4px 0`) cuts off the top or bottom of tall formulas.

### Evidence
```css
.katex-display {
  overflow-x: auto;
  overflow-y: hidden; /* <-- Clips tall math elements */
  padding: 4px 0;
  margin: 0.5em 0 !important;
}
```

### Impact
Tops of superscripts, upper summation limits, matrix boundaries, and tall fractions in display formulas are visually truncated.

### Recommendation
Remove `overflow-y: hidden` and adjust vertical padding:
```css
.katex-display {
  overflow-x: auto;
  overflow-y: visible;
  padding: 8px 0;
  margin: 0.5em 0 !important;
}
```

---

## [F-003] Duplicate KaTeX Dependencies in `package-lock.json` & Type Version Mismatch

**Severity:** Minor
**Location:** `package.json:22, 35`, `package-lock.json`

### Description
In `package.json`, top-level dependencies specify:
- `"katex": "^0.18.1"`
- `"@types/katex": "^0.16.8"`
- `"rehype-katex": "^7.0.1"`

`rehype-katex@7.0.1` and `micromark-extension-math@3.1.0` both declare dependencies on `katex@^0.16.0`. Consequently, `package-lock.json` installs two separate versions of `katex` (`0.18.1` at root and `0.16.47` nested under dependencies). Additionally, `@types/katex` is locked to `0.16.8` while root `katex` is `0.18.1`.

### Evidence
In `package-lock.json`:
- Root `node_modules/katex`: version `0.18.1`
- `node_modules/rehype-katex/node_modules/katex`: version `0.16.47`
- `node_modules/micromark-extension-math/node_modules/katex`: version `0.16.47`

### Impact
- Redundant files and duplicated dependency trees in `node_modules`.
- Risk of subtle CSS or AST mismatches if `rehype-katex` uses `0.16.47` rendering structures while `MarkdownMessage.tsx` imports CSS from `katex@0.18.1`.

### Recommendation
Align KaTeX dependency versions in `package.json`:
- Set `"katex": "^0.16.9"` (or version compatible with `rehype-katex` v7 without nested duplicate) or run `npm dedupe`.
- Update `@types/katex` to match installed `katex` major/minor version.

---

## [F-004] Main Bundle Size Exceeds Vite Limit (~716 kB Chunk)

**Severity:** Minor
**Location:** `src/components/MarkdownMessage.tsx:3-5`

### Description
`MarkdownMessage.tsx` statically imports `remark-math`, `rehype-katex`, and `"katex/dist/katex.min.css"`. During build, Vite bundles all KaTeX parsing and rendering modules into the main client chunk (`main.js`), pushing chunk size to **716.61 kB** (minified).

### Evidence
Build output from `npm run build`:
```
dist/assets/main-Cu2sAyyM.js                       716.61 kB │ gzip: 206.55 kB
(!) Some chunks are larger than 500 kB after minification.
```

### Impact
Increases application initial JS evaluation time and memory footprint on launch, even for views or sessions that do not display mathematical notations.

### Recommendation
While acceptable for local desktop Tauri apps, if initial bundle size becomes a performance concern, consider dynamically importing math plugins or code-splitting `MarkdownMessage` / math rendering.

---

## [F-005] Unstyled KaTeX Error Output in Dark Theme

**Severity:** Minor
**Location:** `src/components/MarkdownMessage.tsx:15`, `src/index.css`

### Description
`rehypeKatex` is configured with `{ strict: false }`. When invalid or unsupported LaTeX syntax is encountered, KaTeX outputs `.katex-error` spans with default inline styling (`color: #cc0000`). There are no theme-specific overrides in `src/index.css` for `.katex-error`.

### Evidence
In `MarkdownMessage.tsx`:
```tsx
rehypePlugins={[[rehypeKatex, { strict: false }]]}
```

### Impact
Malformed math inputs output harsh, unstyled red text that clashes with GQuick's dark theme palette (`bg-zinc-950`).

### Recommendation
Add dark theme fallback styling for `.katex-error` in `src/index.css`:
```css
.katex-error {
  color: #f87171 !important; /* Tailwind red-400 */
  font-family: inherit;
}
```
