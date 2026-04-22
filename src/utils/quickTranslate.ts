// Quick translate utility - shared between App and translate plugin

function isLikelyGerman(text: string): boolean {
  const lower = text.toLowerCase();
  if (/[äöüß]/.test(text)) return true;
  const germanWords = ["der", "die", "das", "und", "ist", "zu", "ein", "eine", "mit", "auf", "für", "von", "nicht", "ich", "du", "er", "sie", "es", "wir", "ihr", "den", "dem", "des", "im", "bei", "als", "auch", "wie", "aber", "oder", "wenn", "dass", "durch", "über", "unter", "vor", "nach", "zwischen", "gegen", "ohne", "um", "zum", "zur", "an", "aus", "hinter", "in", "neben", "willkommen", "danke", "bitte", "guten", "tag", "morgen", "abend", "nacht"];
  const words = lower.split(/\s+/);
  const germanCount = words.filter(w => germanWords.includes(w)).length;
  return germanCount >= 2 || (words.length <= 3 && germanCount >= 1);
}

export interface QuickTranslateResult {
  result: string;
  detectedLang: string;
  targetLang: string;
  error?: string;
}

export function isQuickTranslateQuery(query: string): { isQuick: boolean; text: string } {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith("t: ") || lower.startsWith("t:")) {
    return { isQuick: true, text: trimmed.substring(2).trim() };
  }
  if (lower.startsWith("tr: ") || lower.startsWith("tr:")) {
    return { isQuick: true, text: trimmed.substring(3).trim() };
  }
  if (trimmed.startsWith("> ")) {
    return { isQuick: true, text: trimmed.substring(2).trim() };
  }

  return { isQuick: false, text: "" };
}

export async function performQuickTranslate(text: string): Promise<QuickTranslateResult> {
  const apiKey = localStorage.getItem("api-key");
  const provider = localStorage.getItem("api-provider") || "openai";
  const model = localStorage.getItem("selected-model");

  if (!apiKey || !model) {
    return { result: "", detectedLang: "", targetLang: "", error: "Configure API key in Settings (⌘,)" };
  }

  const isGerman = isLikelyGerman(text);
  const targetLang = isGerman ? "English" : "German";
  const sourceHint = isGerman ? "German" : "auto-detected";

  const prompt = `Translate this text to ${targetLang}:\n${text.trim()}\n\nReturn ONLY the translated text, no explanations.`;

  try {
    let responseText = "";

    if (provider === "openai" || provider === "kimi") {
      const baseUrl = provider === "kimi" ? "https://api.moonshot.cn" : "https://api.openai.com";
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || "";
    } else if (provider === "google") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          }),
        }
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      responseText = data.content?.[0]?.text || "";
    }

    return { result: responseText.trim(), detectedLang: sourceHint, targetLang };
  } catch (err: any) {
    return { result: "", detectedLang: "", targetLang: "", error: err.message || "Translation failed" };
  }
}
