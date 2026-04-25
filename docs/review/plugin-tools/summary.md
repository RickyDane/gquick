# Code Review Summary: Plugin-Tools for AI Chat

**Reviewer:** Code Reviewer Agent  
**Date:** 2025-04-25  
**Status:** Needs Changes  

## Overall Assessment
The Plugin-Tools feature is architecturally sound and follows a clean plugin pattern, but the streaming accumulation and recursion logic contain **critical bugs** that will cause lost tool calls, unhandled promise rejections, and potential infinite loops. These must be fixed before the feature is considered stable. Several major maintainability and correctness issues also need attention.

## Critical Issues (4)

1. **Unhandled promise rejections in streaming callbacks** (`streaming.ts` + `App.tsx`)  
   The `onDone` callback is async but invoked without `await`. Errors during recursive tool rounds crash silently and can leave the UI stuck loading.

2. **OpenAI tool-call accumulation breaks on non-contiguous indices** (`streaming.ts`)  
   Looping `for (let i = 0; i < map.size; i++)` assumes contiguous `tc.index` values. Skipped indices cause tool calls to vanish.

3. **Anthropic tool-call accumulation breaks on interleaved blocks** (`streaming.ts`)  
   Text blocks interleaved with `tool_use` blocks produce non-contiguous Map keys. The same loop bug drops later tool calls.

4. **Infinite recursion risk in `streamWithTools`** (`App.tsx`)  
   No depth cap on tool-call rounds. A misbehaving model or recursive tool result can loop forever.

## Major Issues (5)

5. **User message content replaced by notes context** (`App.tsx`)  
   The last user message is overwritten rather than augmented, which is fragile and breaks multimodal image+text flows.

6. **Assistant streaming text discarded on tool calls** (`App.tsx`)  
   Any natural-language text streamed before a tool call is replaced by the hard-coded string `"Using tools..."`.

7. **Gemini may emit duplicate tool calls** (`streaming.ts`)  
   Each SSE chunk containing `functionCall` pushes a new `ToolCall`; duplicates can trigger double side effects.

8. **Widespread `any` types erode type safety** (`types.ts`, `toolManager.ts`, `streaming.ts`, `App.tsx`)  
   `Record<string, any>`, `body: any`, and `apiMessages: any[]` hide real type errors.

9. **Gemini message conversion is O(n²)** (`toolManager.ts`)  
   Every tool-result message scans the entire history to find its name.

## Minor Issues (6)

10. Type cast excludes `"kimi"` in `convertToolsForProvider` call.  
11. Gemini tool-call IDs use `Date.now()`, risking collisions.  
12. No input validation in plugin `executeTool` handlers (files, notes).  
13. OpenAI tool name accumulation uses `+=` instead of `=`.  
14. Tool results are not truncated before re-injection into history.  
15. `Message` interface is duplicated between `App.tsx` and `toolManager.ts`.

## Positive Findings

- **Clean plugin architecture** — Unifies search and AI tools without breaking existing plugins.  
- **Error isolation** — `executeTool` wraps plugins in `try/catch`, preventing cascading failures.  
- **Provider format fidelity** — OpenAI, Anthropic, and Gemini message shapes match official schemas.  
- **Calculator safety** — Custom parser with depth limits and regex pre-filtering prevents injection.  
- **Network info caching** — Deduplicates in-flight requests and uses TTL caching.

## Recommendation

**Do not merge until the four critical issues are resolved.** The streaming accumulation bugs (CRIT-002, CRIT-003) are one-line fixes (iterate Map entries instead of assuming contiguous indices). The unhandled-rejection issue (CRIT-001) requires adding `await` to all `callbacks.onDone()` invocations in `streaming.ts`. The recursion guard (CRIT-004) should be a small `depth` parameter with a limit of 5–10 rounds.

After critical fixes, address the major issues in priority order: preserve assistant text (MAJ-002), stop replacing user content (MAJ-001), and introduce a `JsonValue` type to replace `any` (MAJ-004).
