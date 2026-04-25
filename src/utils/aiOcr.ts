// AI OCR utility - uses vision models for text extraction on Windows/Linux

const OCR_PROMPT = "Extract all text from this image. Return only the extracted text, no explanations.";

export async function performAiOcr(imageBase64: string): Promise<string> {
  const apiKey = localStorage.getItem("api-key");
  const provider = localStorage.getItem("api-provider") || "openai";
  const model = localStorage.getItem("selected-model");

  if (!apiKey || !model) {
    return "Error: API key or model not configured. Please set them in Settings.";
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
        const body = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${body}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || "";
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
        const body = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${body}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
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
        const body = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${body}`);
      }
      const data = await res.json();
      return data.content?.[0]?.text?.trim() || "";
    }

    return "Error: Unsupported AI provider.";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "OCR failed";
    return `Error: ${message}`;
  }
}
