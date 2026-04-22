// Streaming utilities for AI chat APIs

export interface StreamCallbacks {
  onContent: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
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
