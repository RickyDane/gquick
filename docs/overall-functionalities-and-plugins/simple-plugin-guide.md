# How to Build a Simple Plugin

## Summary
A simple plugin is the right choice when a feature can stay small, fast, and mostly local: one clear query pattern, a short list of results, and a few explicit actions. Use this pattern for launcher-like tools, quick lookups, or a narrow AI tool, not for a full feature area with its own screen.

If you are new to GQuick, start here. This page gives the shortest path first, then the implementation plan.

## Quick Start
1. Create a new plugin file in `src/plugins/`.
2. Export a `GQuickPlugin` object from `src/plugins/types.ts`.
3. Add `metadata` with a unique `id`, title, icon, and keywords.
4. Implement `getItems(query)` and return launcher results.
5. Keep side effects out of `getItems`; put them in `onSelect` or `actions`.
6. Register the plugin in `src/plugins/index.ts`.
7. Test the query, selection, and any tool calls.

### Quick verification
- Type the plugin trigger in the launcher.
- Confirm it appears only when expected.
- Select a result and confirm the action runs once.
- If the plugin exposes tools, confirm each tool returns a safe success/error result.

## Detailed Plan

### 1) Choose the plugin shape
Use a simple plugin when:
- the search logic is small and predictable
- results can be built from one source
- the user should see the plugin only for a specific prefix or keyword
- actions are limited to opening, copying, or reading data

Use a more explicit design when the plugin is slow, network-bound, or risky.

### 2) Create the file and structure
Typical structure:
- `src/plugins/myPlugin.tsx`
- exported constant: `myPlugin`
- optional helper functions near the plugin when the logic is tiny

Keep the plugin self-contained. If it grows large, split data fetching, formatting, and actions into small helpers.

### 3) Define metadata
`metadata` tells GQuick how to label and route the plugin.

Include:
- `id`: unique and stable
- `title`: user-facing name
- `icon`: Lucide icon
- `keywords`: search terms users may type
- `queryPrefixes`: optional explicit prefixes for opt-in routing

Safe default:
- use `queryPrefixes` for expensive plugins or ones that should only run when the user asks directly
- keep keywords broad only when search is cheap

### 4) Handle the query
`getItems(query)` should be fast, predictable, and free of side effects.

Good uses:
- filter local data
- format computed results
- prepare display-only state

Avoid in `getItems`:
- writes
- confirmations
- navigation
- destructive commands
- repeated network calls without a prefix or debounce

If the plugin is expensive, add one of these:
- `shouldSearch(query)` to opt out early
- `searchDebounceMs` for a fixed delay
- `getSearchDebounceMs(query)` for query-aware delay

### 5) Return search results
Each result item should explain itself clearly.

Useful fields:
- `title`
- `subtitle`
- `icon`
- `score`
- `onSelect`
- `actions`
- `renderPreview`

Simple result rule:
- one result should lead to one obvious next step

### 6) Add optional actions
Use `actions` for alternate safe actions, such as:
- copy value
- open in app
- show details
- retry or refresh

Put side effects here instead of `getItems`.

### 7) Add optional AI tools
Only add tools when the plugin has a clear AI use case.

If you add `tools`:
- define a narrow schema
- implement `executeTool(name, args)`
- validate every argument
- return `{ content, success }` or `{ content, success: false, error }`

Keep AI tools explicit and bounded. Do not expose destructive or broad system access.

### 8) Register the plugin
Add the plugin to `src/plugins/index.ts` so GQuick can discover it.

Registration is static today, so new plugins must be added to the registry manually.

### 9) Test the plugin
Check these cases:
- empty query
- normal query
- prefix query, if used
- selection once only
- action execution
- tool execution, if any
- slow-query behavior, if debounced

## Minimal Example
```ts
export const myPlugin: GQuickPlugin = {
  metadata: {
    id: "my-plugin",
    title: "My Plugin",
    icon: SomeIcon,
    keywords: ["my", "example"],
    queryPrefixes: ["my:"],
  },
  shouldSearch: query => query.trim().startsWith("my:"),
  searchDebounceMs: 150,
  async getItems(query) {
    const value = query.replace(/^my:/i, "").trim();

    return [{
      id: "my-plugin-item",
      pluginId: "my-plugin",
      title: `Result for ${value}`,
      subtitle: "Short description",
      icon: SomeIcon,
      onSelect: () => {
        // side effect here
      },
      actions: [
        { id: "copy", label: "Copy", onRun: () => {} },
      ],
    }];
  },
};
```

## Safe Defaults
- Make expensive plugins opt-in with `queryPrefixes`.
- Debounce search when results depend on slow work.
- Keep `getItems` pure and quick.
- Put writes, navigation, and confirmations in `onSelect` or actions.
- Keep tool scope narrow and validate all input.

## Checklist
- [ ] Plugin has a unique `metadata.id`
- [ ] Query routing is explicit when the plugin is expensive
- [ ] `getItems` returns fast, predictable results
- [ ] Side effects live in actions or `onSelect`
- [ ] Tool inputs are validated, if tools exist
- [ ] Plugin is registered in `src/plugins/index.ts`
- [ ] Query, selection, and tool paths are tested

## Common Pitfalls
- Running network or disk work on every keystroke
- Doing writes inside `getItems`
- Using a non-unique plugin id
- Returning vague result titles with no clear next step
- Adding tools without argument validation
- Forgetting to register the plugin after creating it

## Related Docs
- [Plugin catalog](plugin-catalog.md)
- [Developer notes](developer-notes.md)
- [Setup and configuration](setup-configuration.md)
