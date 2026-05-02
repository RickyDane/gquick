// AI OCR utility - uses vision models for text extraction on Windows/Linux

const OCR_PROMPT = "Extract all text from this image. Return only the extracted text, no explanations.";
const MAX_ERROR_BODY_LENGTH = 500;
const UNKNOWN_AI_OCR_ERROR = "AI OCR failed for an unknown reason. Check logs for details.";

function truncateForDisplay(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= MAX_ERROR_BODY_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_ERROR_BODY_LENGTH)}…`;
}

function sanitizeErrorMessage(message: string, apiKey: string): string {
  if (!apiKey) return message;
  return message.split(apiKey).join("[redacted api key]");
}

async function readApiError(res: Response, apiKey: string): Promise<string> {
  const body = await res.text().catch(() => "");
  const bodyText = truncateForDisplay(sanitizeErrorMessage(body, apiKey));
  const statusText = res.statusText ? ` ${res.statusText}` : "";

  if (!bodyText) {
    return `API error ${res.status}${statusText}. Response body was empty.`;
  }

  return `API error ${res.status}${statusText}: ${bodyText}`;
}

function formatNetworkError(err: unknown): string | null {
  if (err instanceof TypeError && /failed to fetch/i.test(err.message)) {
    return "Network error: Failed to fetch AI OCR API. Check internet connection, provider API reachability, CORS restrictions, or firewall/proxy settings.";
  }

  return null;
}

function formatUnknownError(err: unknown): string {
  if (err == null) return UNKNOWN_AI_OCR_ERROR;

  if (err instanceof Error) return err.message.trim() || UNKNOWN_AI_OCR_ERROR;
  if (typeof err === "string") return err.trim() || UNKNOWN_AI_OCR_ERROR;

  if (err && typeof err === "object") {
    try {
      return JSON.stringify(err) || UNKNOWN_AI_OCR_ERROR;
    } catch {
      return String(err).trim() || UNKNOWN_AI_OCR_ERROR;
    }
  }

  return String(err).trim() || UNKNOWN_AI_OCR_ERROR;
}

export type AiOcrResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

function toAiOcrSuccess(text: unknown): AiOcrResult {
  const extractedText = typeof text === "string" ? text : "";
  if (!extractedText.trim()) {
    return { ok: false, error: "AI OCR returned an empty response." };
  }

  return { ok: true, text: extractedText };
}

export async function performAiOcrResult(imageBase64: string): Promise<AiOcrResult> {
  const apiKey = localStorage.getItem("api-key");
  const provider = localStorage.getItem("api-provider") || "openai";
  const model = localStorage.getItem("selected-model");

  if (!apiKey && !model) {
    return { ok: false, error: `API key and model are not configured for provider "${provider}". Please set them in Settings.` };
  }

  if (!apiKey) {
    return { ok: false, error: `API key is not configured for provider "${provider}". Please set it in Settings.` };
  }

  if (!model) {
    return { ok: false, error: `Model is not configured for provider "${provider}". Please select a model in Settings.` };
  }

  try {
    if (provider === "openai" || provider === "kimi") {
      const baseUrl = provider === "kimi" ? "https://api.moonshot.ai" : "https://api.openai.com";
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
            ]
          }],
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, apiKey));
      }
      const data = await res.json();
      return toAiOcrSuccess(data.choices?.[0]?.message?.content);
    } else if (provider === "google") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: OCR_PROMPT },
                { inlineData: { mimeType: "image/png", data: imageBase64 } }
              ]
            }],
          }),
        }
      );
      if (!res.ok) {
        throw new Error(await readApiError(res, apiKey));
      }
      const data = await res.json();
      return toAiOcrSuccess(data.candidates?.[0]?.content?.parts?.[0]?.text);
    } else if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4096,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } }
            ]
          }],
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, apiKey));
      }
      const data = await res.json();
      return toAiOcrSuccess(data.content?.[0]?.text);
    }

    return { ok: false, error: `Unsupported AI provider "${provider}" for AI OCR. Configured model: "${model}".` };
  } catch (err: unknown) {
    const networkMessage = formatNetworkError(err);
    const message = networkMessage || formatUnknownError(err);
    return { ok: false, error: sanitizeErrorMessage(message, apiKey) };
  }
}

export async function performAiOcr(imageBase64: string): Promise<string> {
  const result = await performAiOcrResult(imageBase64);
  return result.ok ? result.text : `Error: ${result.error}`;
}
