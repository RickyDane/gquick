# Code Review Findings: Plugin-Tools for AI Chat

**Date:** 2025-04-25  
**Scope:** Tool types, tool manager, streaming utilities, chat integration, and plugin implementations.  
**Files Reviewed:**
- `src/plugins/types.ts`
- `src/utils/toolManager.ts`
- `src/utils/streaming.ts`
- `src/App.tsx` (chat integration)
- `src/plugins/calculator.tsx`
- `src/plugins/fileSearch.tsx`
- `src/plugins/notes.tsx`
- `src/plugins/networkInfo.tsx`

---

## [CRIT-001] Async `onDone` callbacks are fire-and-forget, causing unhandled rejections

**Severity:** Critical  
**Location:** `src/utils/streaming.ts` (lines 248-263, 317, 377-392) and `src/App.tsx` (line 1108)

### Description
All three tool-aware streaming functions (`streamOpenAITools`, `streamGeminiTools`, `streamAnthropicTools`) call `callbacks.onDone()` without awaiting it. In `App.tsx`, the `onDone` handler is declared as `async` and performs recursive work (`await streamWithTools(...)`). Because the streaming utility does not await the callback, any error thrown inside the recursive call becomes an **unhandled promise rejection** rather than being caught by the outer `try/catch` in `streamWithTools`.

### Evidence
```typescript
// streaming.ts:260 — callback is invoked without await
callbacks.onDone(toolCalls);

// App.tsx:1108 — handler is async
onDone: async (toolCalls?: ToolCall[]) => {
  if (toolCalls && toolCalls.length > 0) {
    // ...
    await streamWithTools(afterToolMessages, null);  // Errors here are unhandled
  }
}
```

### Impact
- Tool-execution or recursion errors crash the stream silently.
- `setIsLoading(false)` may never fire, leaving the UI stuck in a loading state.
- Sentry/logs will show unhandled rejections instead of clean error handling.

### Recommendation
Change all streaming utilities to `await callbacks.onDone(...)`:
```typescript
await callbacks.onDone(toolCalls.length > 0 ? toolCalls : undefined);
```

---

## [CRIT-002] OpenAI streaming tool-call accumulation breaks on non-contiguous indices

**Severity:** Critical  
**Location:** `src/utils/streaming.ts` (lines 248-251)

### Description
OpenAI streams tool calls indexed by `tc.index`. The code accumulates them in a `Map<number, ...>` but later iterates with a simple `for` loop assuming contiguous keys starting at 0:

```typescript
for (let i = 0; i < toolCallAcc.size; i++) {
  const acc = toolCallAcc.get(i);
  if (!acc) continue;
  // ...
}
```

If the API returns indices `[0, 2]` (e.g., index 1 is skipped or arrives out of order), `size === 2`, the loop checks `0` and `1`, missing key `2` entirely. The model’s second tool call is lost.

### Impact
- Multi-tool calls may be partially dropped, causing the AI to act on incomplete information.
- Follow-up messages will reference a `toolCallId` that was never emitted to the app.

### Recommendation
Iterate the Map directly, sorted by key:
```typescript
const sorted = Array.from(toolCallAcc.entries()).sort(([a], [b]) => a - b);
for (const [, acc] of sorted) { /* ... */ }
```

---

## [CRIT-003] Anthropic streaming tool-call accumulation breaks on interleaved text/tool blocks

**Severity:** Critical  
**Location:** `src/utils/streaming.ts` (lines 377-381)

### Description
Anthropic can interleave `text` and `tool_use` content blocks (e.g., index 0 = text, index 1 = tool_use, index 2 = text, index 3 = tool_use). The code stores tool-use blocks in `toolAcc` by their index, then iterates:

```typescript
for (let i = 0; i < toolAcc.size; i++) {
  const acc = toolAcc.get(i);
  if (!acc) continue;
  // ...
}
```

Because `toolAcc` only contains the tool-use indices, `size` equals the number of tool calls. If those indices are `[1, 3]`, the loop checks `0` and `1`, finding only index `1` and silently dropping index `3`.

### Impact
- Same as CRIT-002: tool calls are lost, history becomes inconsistent, and the model may receive incomplete tool results.

### Recommendation
Use the same fix as CRIT-002:
```typescript
const sorted = Array.from(toolAcc.entries()).sort(([a], [b]) => a - b);
for (const [, acc] of sorted) { /* ... */ }
```

---

## [CRIT-004] `streamWithTools` has no recursion depth limit — infinite loop risk

**Severity:** Critical  
**Location:** `src/App.tsx` (lines 1078-1135)

### Description
When the model returns tool calls, `streamWithTools` appends the results and calls itself recursively:

```typescript
await streamWithTools(afterToolMessages, null);
```

There is no `maxTurns` or `depth` guard. A misbehaving model (or a tool whose result always triggers another tool call) can recurse until stack overflow or rate-limit exhaustion.

### Impact
- Denial-of-service via infinite tool-call loops.
- User UI frozen in `isLoading = true` indefinitely.
- Potential runaway API costs.

### Recommendation
Add a `depth` parameter (default 0) and bail after a reasonable limit (e.g., 5-10 rounds):
```typescript
async function streamWithTools(msgs: Message[], notesContext: string | null, depth = 0) {
  const MAX_TOOL_DEPTH = 5;
  if (depth > MAX_TOOL_DEPTH) {
    updateAssistantContent("I’ve used several tools but need to stop here. Please clarify if you need more.");
    setIsLoading(false);
    return;
  }
  // ...
  await streamWithTools(afterToolMessages, null, depth + 1);
}
```

---

## [MAJ-001] Last user message content is replaced instead of augmented with notes context

**Severity:** Major  
**Location:** `src/App.tsx` (lines 1087-1092)

### Description
When a query is note-related, the code replaces the last user message’s `content` entirely with the fetched notes context string:

```typescript
const processedHistory = history.map((m, idx) =>
  idx === lastUserIndex && notesContext
    ? { ...m, content: notesContext }
    : m
);
```

The original user prompt is only preserved because `fetchNotesContext` appends `"User's question: ${query}"` at the end. This is fragile:
- If the user attached images, the text content is still obliterated and replaced with a plain string; multimodal context is lost.
- If `fetchNotesContext` is ever refactored to omit the question, the model would never see the user’s actual query.

### Impact
- Violates the principle of non-destructive message construction.
- Makes the system harder to reason about and maintain.
- May break multimodal flows (images + text) because the text payload is replaced.

### Recommendation
Append/prepend context instead of replacing:
```typescript
const processedHistory = history.map((m, idx) =>
  idx === lastUserIndex && notesContext
    ? { ...m, content: `${notesContext}\n\n${m.content}` }
    : m
);
```

---

## [MAJ-002] Assistant’s streaming text is discarded when tool calls are issued

**Severity:** Major  
**Location:** `src/App.tsx` (lines 1110-1112)

### Description
Some models can emit explanatory text *before* or *alongside* tool calls. The current code overwrites any accumulated assistant content with the hard-coded string `"Using tools..."`:

```typescript
setMessages(prev => prev.map(m =>
  m.id === assistantId ? { ...m, toolCalls, content: "Using tools..." } : m
));
```

If the model said "Let me look that up for you" before the tool call, that text is lost.

### Impact
- User sees a jarring "Using tools..." flash instead of the model’s natural language.
- Breaks models that support parallel text + tool_call generation.

### Recommendation
Preserve existing content:
```typescript
setMessages(prev => prev.map(m =>
  m.id === assistantId
    ? { ...m, toolCalls, content: m.content || "Using tools..." }
    : m
));
```

---

## [MAJ-003] Gemini streaming may emit duplicate tool calls

**Severity:** Major  
**Location:** `src/utils/streaming.ts` (lines 299-307)

### Description
On every SSE chunk that contains `part.functionCall`, the code unconditionally pushes a new `ToolCall` into the array:

```typescript
if (part.functionCall) {
  toolCalls.push({
    id: `gemini-${Date.now()}-${toolCalls.length}`,
    name: part.functionCall.name,
    arguments: part.functionCall.args || {},
  });
}
```

If Gemini delivers a function call across multiple chunks (or re-emits it), duplicate entries are created. Unlike OpenAI and Anthropic, there is no accumulation Map.

### Impact
- The same tool may execute multiple times, causing duplicate side effects (e.g., creating two notes, running two searches).

### Recommendation
Accumulate by name or by a chunk-seen flag, similar to OpenAI/Anthropic:
```typescript
const geminiAcc = new Map<string, ToolCall>(); // key by name or by a chunk signature
// deduplicate before calling onDone
```

---

## [MAJ-004] Widespread use of `any` erodes type safety

**Severity:** Major  
**Location:** Multiple files

### Description
Key interfaces use `any`, defeating TypeScript’s static analysis:

| File | Line | Code |
|------|------|------|
| `src/plugins/types.ts` | 34 | `arguments: Record<string, any>` |
| `src/plugins/types.ts` | 81 | `args: Record<string, any>` |
| `src/utils/toolManager.ts` | 10 | `args: Record<string, any>` |
| `src/utils/streaming.ts` | 62 | `body: any` |
| `src/App.tsx` | 1094 | `apiMessages: any[]` |

### Impact
- Refactoring hazards: renaming a field won’t produce compile errors where `any` is used.
- Runtime bugs from unexpected argument shapes are caught only at execution time.

### Recommendation
Define strict JSON-value types:
```typescript
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
// Use Record<string, JsonValue> instead of Record<string, any>
```

---

## [MAJ-005] Gemini message conversion scans entire history for every tool result (O(n²))

**Severity:** Major  
**Location:** `src/utils/toolManager.ts` (lines 112-121)

### Description
For each `role === "tool"` message, `convertMessagesToGemini` loops over **all** messages to find the matching assistant tool call:

```typescript
for (const msg of messages) {
  if (msg.role === "assistant" && msg.toolCalls) {
    const tc = msg.toolCalls.find((t) => t.id === m.toolCallId);
    // ...
  }
}
```

With long tool-heavy histories this is quadratic.

### Impact
- Noticeable UI lag when converting long chat histories for Gemini.
- Could match the wrong tool call if IDs are ever reused (defensive concern).

### Recommendation
Build a `Map<toolCallId, toolName>` once before mapping:
```typescript
const toolNameById = new Map<string, string>();
for (const m of messages) {
  if (m.role === "assistant" && m.toolCalls) {
    for (const tc of m.toolCalls) toolNameById.set(tc.id, tc.name);
  }
}
// Then use toolNameById.get(m.toolCallId) ?? "unknown"
```

---

## [MIN-001] Type cast excludes `"kimi"` in `convertToolsForProvider` call

**Severity:** Minor  
**Location:** `src/App.tsx` (line 1071)

### Description
```typescript
const providerTools = tools.length > 0 ? convertToolsForProvider(tools, provider as "openai" | "google" | "anthropic") : undefined;
```
The cast omits `"kimi"`, even though `convertToolsForProvider` explicitly handles Kimi (OpenAI-compatible format). This is misleading to future maintainers and could break if stricter types are introduced.

### Recommendation
Use the full union or remove the redundant cast:
```typescript
const providerTools = tools.length > 0 ? convertToolsForProvider(tools, provider as Provider) : undefined;
```

---

## [MIN-002] Gemini tool-call IDs are non-deterministic

**Severity:** Minor  
**Location:** `src/utils/streaming.ts` (line 303)

### Description
```typescript
id: `gemini-${Date.now()}-${toolCalls.length}`,
```
If two tool calls arrive in the same millisecond, their IDs could collide (unlikely but possible under high load or fast execution).

### Recommendation
Use a counter or `crypto.randomUUID()` (if available in the Tauri webview context).

---

## [MIN-003] No input validation in plugin `executeTool` handlers

**Severity:** Minor  
**Location:** `src/plugins/fileSearch.tsx` (line 185), `src/plugins/notes.tsx` (lines 62, 70)

### Description
Tool arguments are passed directly to Tauri commands without checking presence or type:

```typescript
// fileSearch.tsx
const files = await invoke<FileInfo[]>("search_files", { query: args.query });

// notes.tsx
await invoke("create_note", { title: args.title, content: args.content });
```

If the model omits a required arg, `args.query` is `undefined` and the Tauri command receives an invalid payload.

### Recommendation
Add runtime guards:
```typescript
if (typeof args.query !== "string") {
  return { content: "", success: false, error: "Missing required 'query' argument" };
}
```

---

## [MIN-004] OpenAI tool name accumulation uses `+=` instead of `=`

**Severity:** Minor  
**Location:** `src/utils/streaming.ts` (line 236)

### Description
```typescript
if (tc.function?.name) acc.name += tc.function.name;
```
OpenAI sends the full name in the first chunk for each index; `+=` is harmless today but semantically wrong. If the API ever fragments the name, it would be duplicated.

### Recommendation
```typescript
if (tc.function?.name) acc.name = tc.function.name;
```

---

## [MIN-005] Tool results are not truncated before re-injection

**Severity:** Minor  
**Location:** `src/App.tsx` (lines 1119-1124)

### Description
Tool results (e.g., a large file search or a big JSON payload) are inserted into the chat history verbatim. There is no `MAX_TOOL_RESULT_LENGTH` guard, so a single tool response could balloon token usage and exceed model context limits.

### Recommendation
Truncate or summarize oversized results:
```typescript
const MAX_TOOL_CHARS = 8000;
const content = r.result.content.length > MAX_TOOL_CHARS
  ? r.result.content.slice(0, MAX_TOOL_CHARS) + "\n[truncated]"
  : r.result.content;
```

---

## [MIN-006] `Message` interface is duplicated between App.tsx and toolManager.ts

**Severity:** Minor  
**Location:** `src/App.tsx` (lines 77-84) and `src/utils/toolManager.ts` (lines 69-76)

### Description
Both files define nearly identical `Message` interfaces. Divergence risks subtle bugs during serialization.

### Recommendation
Export `Message` from `toolManager.ts` (or a shared types file) and import it in `App.tsx`.

---

## Positive Findings

1. **Clean plugin architecture** — The `GQuickPlugin` interface elegantly unifies search items and AI tools without breaking existing plugins.
2. **Good error isolation in `executeTool`** — `toolManager.ts` wraps plugin execution in `try/catch`, ensuring one crashing plugin doesn’t tear down the whole chat.
3. **Provider format fidelity** — OpenAI `tool_calls`, Anthropic `tool_use`/`tool_result`, and Gemini `functionCall`/`functionResponse` shapes match the official API schemas.
4. **Calculator safety** — Custom parser with depth limits and regex pre-filtering prevents obvious injection/evaluation attacks.
5. **Network info caching** — Deduplicates in-flight requests and TTL-caches results, reducing native bridge chatter.
