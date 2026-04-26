# Release Notes: Web Search AI Tool

## Summary
All AI providers (OpenAI, Kimi, Gemini, Anthropic) can now search the web via DuckDuckGo using a new cross-provider `web_search` tool. Previously, web search was only available as a launcher plugin that opened Google in a browser, and OpenAI's native hosted web search was limited to specific OpenAI models.

## What's New
- **Cross-Provider Web Search**: A new `web_search` tool is available to all AI providers, enabling web lookups regardless of the selected model or provider.
- **DuckDuckGo Integration**: Web searches are performed via the DuckDuckGo HTML API using the Rust `scraper` crate for fast, lightweight results.
- **Launcher Plugin Replaced**: The existing `webSearchPlugin` now exposes the `web_search` tool through `executeTool` instead of only opening Google in the browser.
- **System Prompt Update**: The system prompt now mentions web search capability so models know when and how to use it.

## Bug Fixes
None.

## Migration Notes
No migration required. The new `web_search` tool is available automatically across all supported providers.

## Breaking Changes
None.

## Caveats
- Search results depend on DuckDuckGo HTML API availability and format.
- This complements (not replaces) OpenAI-hosted web search for supported OpenAI models.
