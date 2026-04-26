feat(openai): support hosted web search responses

Use OpenAI's Responses API with hosted web search for supported
OpenAI model families, while keeping Kimi on Chat Completions and
preserving plugin tool support. Citations now render as Markdown
sources, and tool failures provide more useful output.
