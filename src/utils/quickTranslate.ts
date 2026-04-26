// Quick translate utility - shared between App and translate plugin

function isLikelyGerman(text: string): boolean {
  const lower = text.toLowerCase();
  if (/[äöüß]/.test(text)) return true;
  const germanWords = ["der", "die", "das", "und", "ist", "zu", "ein", "eine", "mit", "auf", "für", "von", "nicht", "ich", "du", "er", "sie", "es", "wir", "ihr", "den", "dem", "des", "im", "bei", "als", "auch", "wie", "aber", "oder", "wenn", "dass", "durch", "über", "unter", "vor", "nach", "zwischen", "gegen", "ohne", "um", "zum", "zur", "an", "aus", "hinter", "in", "neben", "willkommen", "danke", "bitte", "guten", "tag", "morgen", "abend", "nacht"];
  const words = lower.split(/\s+/);
  const germanCount = words.filter(w => germanWords.includes(w)).length;
  return germanCount >= 2 || (words.length <= 3 && germanCount >= 1);
}

function isLikelyEnglish(text: string): boolean {
  const lower = text.toLowerCase();
  const englishWords = ["the", "and", "is", "are", "to", "a", "an", "of", "in", "for", "with", "on", "at", "from", "this", "that", "hello", "hi", "thanks", "please", "yes", "no", "good", "morning", "night"];
  const words = lower.split(/\s+/).filter(Boolean);
  const englishCount = words.filter(w => englishWords.includes(w)).length;

  return englishCount >= 2 || (words.length <= 3 && englishCount >= 1);
}

const LANGUAGE_CODE_NAMES: Record<string, string> = {
  en: "English",
  eng: "English",
  english: "English",
  de: "German",
  deu: "German",
  ger: "German",
  german: "German",
  deutsch: "German",
};

function normalizeLanguageName(language: string): string {
  const trimmed = language.trim();
  if (!trimmed) return "auto-detected";

  const normalized = trimmed.toLowerCase();
  if (normalized.includes("english")) return "English";
  if (normalized.includes("german") || normalized.includes("deutsch")) return "German";

  const withoutRegion = normalized.split(/[-_]/)[0];
  const codeName = LANGUAGE_CODE_NAMES[withoutRegion];
  if (codeName) return codeName;

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function getAutoTargetLanguage(detectedLanguage: string): string {
  return normalizeLanguageName(detectedLanguage).toLowerCase() === "english" ? "German" : "English";
}

function parseTranslationPayload(responseText: string): {
  translation: string;
  detectedLanguage: string;
} | null {
  const cleaned = responseText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;

  try {
    const payload = JSON.parse(jsonText) as Record<string, unknown>;
    const translation = payload.translation ?? payload.translated_text ?? payload.result;
    const detectedLanguage = payload.detected_language ?? payload.source_language ?? payload.source;

    if (typeof translation === "string" && translation.trim()) {
      return {
        translation: translation.trim(),
        detectedLanguage: typeof detectedLanguage === "string" ? normalizeLanguageName(detectedLanguage) : "auto-detected",
      };
    }
  } catch {
    // Some providers may ignore JSON mode instructions; caller falls back to raw text.
  }

  return null;
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
  return { isQuick: false, text: "" };
}

export async function performQuickTranslate(text: string): Promise<QuickTranslateResult> {
  if (!text.trim()) {
    return { result: "", detectedLang: "", targetLang: "" };
  }

  const apiKey = localStorage.getItem("api-key");
  const provider = localStorage.getItem("api-provider") || "openai";
  const model = localStorage.getItem("selected-model");

  if (!apiKey || !model) {
    return { result: "", detectedLang: "", targetLang: "", error: "Configure API key in Settings (⌘,)" };
  }

  const fallbackDetectedLang = isLikelyGerman(text) ? "German" : isLikelyEnglish(text) ? "English" : "auto-detected";
  const fallbackTargetLang = getAutoTargetLanguage(fallbackDetectedLang);

  const prompt = `Detect the source language, then translate using this rule: if the source language is English, translate to German; otherwise translate to English.\n\nText:\n${text.trim()}\n\nReturn ONLY valid JSON in this exact shape: {"detected_language":"<language name>","translation":"<translated text>"}.`;

  try {
    let responseText = "";

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

    const parsed = parseTranslationPayload(responseText);
    if (parsed) {
      const detectedLang = parsed.detectedLanguage === "auto-detected" ? fallbackDetectedLang : parsed.detectedLanguage;
      const targetLang = getAutoTargetLanguage(detectedLang);
      return { result: parsed.translation, detectedLang, targetLang };
    }

    return { result: responseText.trim(), detectedLang: fallbackDetectedLang, targetLang: fallbackTargetLang };
  } catch (err: any) {
    return { result: "", detectedLang: "", targetLang: "", error: err.message || "Translation failed" };
  }
}
