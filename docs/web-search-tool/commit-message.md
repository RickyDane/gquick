feat(tools): add cross-provider web_search tool via DuckDuckGo

Implement a new web_search AI tool using the DuckDuckGo HTML API
and scraper crate, making web search available to all providers
(OpenAI, Kimi, Gemini, Anthropic). The webSearchPlugin now
exposes web_search through executeTool instead of only launching
Google in the browser. The system prompt is updated so models
know to use the tool when fresh web data is needed.
