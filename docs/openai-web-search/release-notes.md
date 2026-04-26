# Release Notes: OpenAI Hosted Web Search

## Summary
OpenAI requests can now use hosted web search when supported by the selected OpenAI model. This gives users fresher answers with source citations while keeping existing plugin tools available.

## What's New
- **Hosted OpenAI Web Search**: Supported OpenAI models use the Responses API with `web_search_preview` for built-in web lookup.
- **Markdown Sources**: Web citations are shown as Markdown sources, making referenced pages easier to review and copy.
- **Provider-Specific Behavior**: Kimi continues to use Chat Completions, and plugin tools remain supported alongside the OpenAI-hosted search flow.

## Bug Fixes
- Tool errors now return more useful output so users can better understand what went wrong.

## Migration Notes
No migration required. OpenAI-hosted web search is used automatically only for known supported OpenAI model families.

## Breaking Changes
None.

## Caveats
- Hosted web search depends on OpenAI model support. Unsupported OpenAI models will not use `web_search_preview`.
- This change does not add hosted web search for non-OpenAI providers.
