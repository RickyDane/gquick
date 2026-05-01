# Developer Notes: Plugins and Tools

## Plugin Location
Built-in plugins live in `src/plugins/` and are registered in `src/plugins/index.ts`.

Current registry order:
1. app launcher
2. file search
3. calculator
4. Docker
5. web search
6. translate
7. notes
8. network info
9. speedtest
10. weather

## Core Interfaces
Plugins implement `GQuickPlugin` from `src/plugins/types.ts`.

Key fields:
- `metadata`: id, title, icon, keywords, optional `queryPrefixes`
- `shouldSearch(query)`: optional query gate for expensive or explicit plugins
- `searchDebounceMs` / `getSearchDebounceMs`: optional delay control
- `getItems(query)`: returns launcher results
- `tools`: optional AI chat tools
- `executeTool(name, args)`: required when `tools` is provided

Result items can include:
- `title`, `subtitle`, `icon`
- `score` for ranking
- `onSelect`
- `actions`
- `renderPreview`
- live `titleNode`/`subtitleNode` for changing states

## Adding a Plugin
1. Create `src/plugins/myPlugin.tsx`.
2. Export a `GQuickPlugin` object with unique `metadata.id`.
3. Implement `getItems` and keep side effects in `onSelect` or explicit actions.
4. Add `shouldSearch` or `queryPrefixes` if the plugin is expensive or should be opt-in.
5. Register it in `src/plugins/index.ts`.
6. Add docs to `docs/overall-functionalities-and-plugins/plugin-catalog.md`.

## Query Routing
`getPluginsForQuery(query)` first checks explicit `queryPrefixes`. If one or more prefixes match, only those plugins run. Otherwise, all plugins run and may self-filter through `shouldSearch`.

Use explicit prefixes for plugins that call external services or slow local commands. Docker and speedtest are good examples.

## AI Tools
AI tools are discovered by `getAllTools()` in `src/utils/toolManager.ts` and executed by `executeTool()`.

When adding a tool:
1. Add a `tools` entry with JSON-schema-like parameters.
2. Implement `executeTool` and validate all arguments.
3. Return `{ content, success }` or `{ content, success: false, error }`.
4. Avoid destructive operations unless user confirmation is handled elsewhere.
5. Keep file/system access bounded and explicit.

Tool conversion is provider-specific:
- OpenAI/Kimi: function tools
- Google Gemini: function declarations
- Anthropic: tool-use input schema

## Safety Patterns to Preserve
- Do not run slow plugins for every keystroke without a prefix or debounce.
- Ask for confirmation before destructive Docker operations.
- Keep local file reads restricted to safe text files returned by runtime search results.
- Reject hidden paths, symlinks, likely secrets, credentials, key files, directories, and non-regular files in AI file reads.
- Cap read sizes and result counts.
- Treat AI output as assistive and user-verified.

## Documentation Checklist for Plugin Changes
- Update plugin catalog trigger/action/tool table.
- Update setup notes if a plugin needs API keys, CLI tools, permissions, or external services.
- Update limitations/security notes for new risks.
- Add release notes and a proposed commit message when behavior changes.
