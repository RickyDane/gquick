// Streaming utilities for AI chat APIs
import { ToolCall } from "../plugins/types";

export interface StreamCallbacks {
  onContent: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export interface StreamToolCallbacks {
  onToolCall?: (toolCall: ToolCall) => void;
  onContent: (text: string) => void;
  onDone: (toolCalls?: ToolCall[]) => void;
  onError: (error: string) => void;
}

interface OpenAIUrlCitation {
  url: string;
  title?: string;
}

function getSafeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/([\\[\]])/g, "\\$1");
}

async function readSSEStream(
  response: Response,
  onLine: (line: string) => void,
  onError: (error: string) => void
) {
  if (!response.body) {
    onError("No response body");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          onLine(line);
        }
      }
    }

    if (buffer.trim()) {
      onLine(buffer);
    }
  } catch (err: any) {
    onError(err.message || "Stream read error");
  } finally {
    reader.releaseLock();
  }
}

// OpenAI / Kimi streaming
export async function streamOpenAI(
  url: string,
  headers: Record<string, string>,
  body: any,
  callbacks: StreamCallbacks
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    callbacks.onError(err.error?.message || `API error: ${res.status}`);
    return;
  }

  let content = "";

  await readSSEStream(
    res,
    (line) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          callbacks.onContent(content);
        }
      } catch {
        // ignore parse errors for malformed chunks
      }
    },
    callbacks.onError
  );

  callbacks.onDone();
}

// Google Gemini streaming
export async function streamGemini(
  url: string,
  headers: Record<string, string>,
  body: any,
  callbacks: StreamCallbacks
) {
  const res = await fetch(url + "&alt=sse", {
    method: "POST",
    headers: { ...headers, Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    callbacks.onError(err.error?.message || `API error: ${res.status}`);
    return;
  }

  let content = "";

  await readSSEStream(
    res,
    (line) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data);
        const parts = parsed.candidates?.[0]?.content?.parts;
        if (parts && parts[0]?.text) {
          content += parts[0].text;
          callbacks.onContent(content);
        }
      } catch {
        // ignore parse errors
      }
    },
    callbacks.onError
  );

  callbacks.onDone();
}

// Anthropic Claude streaming
export async function streamAnthropic(
  url: string,
  headers: Record<string, string>,
  body: any,
  callbacks: StreamCallbacks
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    callbacks.onError(err.error?.message || `API error: ${res.status}`);
    return;
  }

  let content = "";

  await readSSEStream(
    res,
    (line) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const type = parsed.type;
        if (type === "content_block_delta") {
          const delta = parsed.delta;
          if (delta?.text) {
            content += delta.text;
            callbacks.onContent(content);
          }
        }
      } catch {
        // ignore parse errors
      }
    },
    callbacks.onError
  );

  callbacks.onDone();
}

// ------------------------------------------------------------------
// Tool-aware streaming variants
// ------------------------------------------------------------------

export async function streamOpenAITools(
  url: string,
  headers: Record<string, string>,
  body: any,
  callbacks: StreamToolCallbacks
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    callbacks.onError(err.error?.message || `API error: ${res.status}`);
    return;
  }

  let content = "";
  const toolCallAcc = new Map<number, { id: string; name: string; args: string }>();

  await readSSEStream(
    res,
    (line) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content) {
          content += delta.content;
          callbacks.onContent(content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const acc = toolCallAcc.get(tc.index) ?? { id: "", name: "", args: "" };
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
            toolCallAcc.set(tc.index, acc);
          }
        }
      } catch {
        // ignore parse errors
      }
    },
    callbacks.onError
  );

  if (toolCallAcc.size > 0) {
    const toolCalls: ToolCall[] = [];
    const entries = Array.from(toolCallAcc.entries()).sort((a, b) => a[0] - b[0]);
    for (const [, acc] of entries) {
      try {
        const args = acc.args ? JSON.parse(acc.args) : {};
        toolCalls.push({ id: acc.id, name: acc.name, arguments: args });
      } catch {
        toolCalls.push({ id: acc.id, name: acc.name, arguments: { _raw: acc.args } });
      }
    }
    callbacks.onDone(toolCalls);
  } else {
    callbacks.onDone();
  }
}

export async function streamOpenAIResponsesTools(
  url: string,
  headers: Record<string, string>,
  body: any,
  callbacks: StreamToolCallbacks
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    callbacks.onError(err.error?.message || `API error: ${res.status}`);
    return;
  }

  let content = "";
  const citations: OpenAIUrlCitation[] = [];
  const toolCalls: ToolCall[] = [];

  const addCitation = (annotation: any) => {
    const url = annotation?.url;
    if (typeof url !== "string") return;
    const safeUrl = getSafeHttpUrl(url);
    if (!safeUrl || citations.some((c) => c.url === safeUrl)) return;
    citations.push({ url: safeUrl, title: annotation.title });
  };

  const appendCitations = (text: string) => {
    if (citations.length === 0) return text;
    const refs = citations
      .map((citation, index) => {
        const title = typeof citation.title === "string" && citation.title.trim()
          ? citation.title
          : citation.url;
        return `${index + 1}. [${escapeMarkdownLinkText(title)}](<${citation.url}>)`;
      })
      .join("\n");
    return `${text.trimEnd()}\n\n**Sources**\n${refs}`;
  };

  await readSSEStream(
    res,
    (line) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);

        if (parsed.type === "response.output_text.delta" && parsed.delta) {
          content += parsed.delta;
          callbacks.onContent(content);
        }

        if (parsed.type === "response.output_text.annotation.added") {
          addCitation(parsed.annotation);
        }

        if (parsed.type === "response.output_text.done") {
          const annotations = parsed.annotations ?? parsed.text?.annotations;
          if (Array.isArray(annotations)) annotations.forEach(addCitation);
        }

        if (parsed.type === "response.output_item.done" && parsed.item?.type === "function_call") {
          const rawArgs = parsed.item.arguments || "{}";
          let args: Record<string, any>;
          try {
            args = rawArgs ? JSON.parse(rawArgs) : {};
          } catch {
            args = { _raw: rawArgs };
          }
          toolCalls.push({
            id: parsed.item.call_id || parsed.item.id,
            name: parsed.item.name,
            arguments: args,
          });
        }
      } catch {
        // ignore parse errors for malformed chunks
      }
    },
    callbacks.onError
  );

  const finalContent = appendCitations(content);
  if (finalContent !== content) callbacks.onContent(finalContent);
  callbacks.onDone(toolCalls.length > 0 ? toolCalls : undefined);
}

export async function streamGeminiTools(
  url: string,
  headers: Record<string, string>,
  body: any,
  callbacks: StreamToolCallbacks
) {
  const res = await fetch(url + "&alt=sse", {
    method: "POST",
    headers: { ...headers, Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    callbacks.onError(err.error?.message || `API error: ${res.status}`);
    return;
  }

  let content = "";
  const toolCalls: ToolCall[] = [];

  await readSSEStream(
    res,
    (line) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data);
        const parts = parsed.candidates?.[0]?.content?.parts;
        if (parts && parts[0]?.text) {
          content += parts[0].text;
          callbacks.onContent(content);
        }
        if (parts) {
          for (const part of parts) {
            if (part.functionCall) {
              const newCall = {
                id: `gemini-${Date.now()}-${toolCalls.length}`,
                name: part.functionCall.name,
                arguments: part.functionCall.args || {},
              };
              const isDuplicate = toolCalls.some(
                tc => tc.name === newCall.name && JSON.stringify(tc.arguments) === JSON.stringify(newCall.arguments)
              );
              if (!isDuplicate) {
                toolCalls.push(newCall);
              }
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    },
    callbacks.onError
  );

  callbacks.onDone(toolCalls.length > 0 ? toolCalls : undefined);
}

export async function streamAnthropicTools(
  url: string,
  headers: Record<string, string>,
  body: any,
  callbacks: StreamToolCallbacks
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    callbacks.onError(err.error?.message || `API error: ${res.status}`);
    return;
  }

  let content = "";
  const toolAcc = new Map<number, { id: string; name: string; input: string }>();

  await readSSEStream(
    res,
    (line) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);

        if (parsed.type === "content_block_start") {
          if (parsed.content_block?.type === "tool_use") {
            toolAcc.set(parsed.index, {
              id: parsed.content_block.id,
              name: parsed.content_block.name,
              input: "",
            });
          }
        } else if (parsed.type === "content_block_delta") {
          if (parsed.delta?.type === "text_delta" && parsed.delta.text) {
            content += parsed.delta.text;
            callbacks.onContent(content);
          } else if (
            parsed.delta?.type === "input_json_delta" &&
            parsed.delta.partial_json
          ) {
            const acc = toolAcc.get(parsed.index);
            if (acc) acc.input += parsed.delta.partial_json;
          }
        }
      } catch {
        // ignore parse errors
      }
    },
    callbacks.onError
  );

  if (toolAcc.size > 0) {
    const toolCalls: ToolCall[] = [];
    const entries = Array.from(toolAcc.entries()).sort((a, b) => a[0] - b[0]);
    for (const [, acc] of entries) {
      try {
        const input = acc.input ? JSON.parse(acc.input) : {};
        toolCalls.push({ id: acc.id, name: acc.name, arguments: input });
      } catch {
        toolCalls.push({ id: acc.id, name: acc.name, arguments: { _raw: acc.input } });
      }
    }
    callbacks.onDone(toolCalls);
  } else {
    callbacks.onDone();
  }
}
