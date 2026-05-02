import { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { performAiOcrResult } from "../utils/aiOcr";

const AI_OCR_TIMEOUT_MS = 45_000;
const UNKNOWN_AI_OCR_ERROR = "AI OCR failed for an unknown reason. Check logs for details.";

/* ── Extraction animation keyframes (injected once) ─────────────────────── */
const EXTRACTION_STYLE_ID = "gquick-extraction-anim";

function ensureExtractionStyles() {
  if (document.getElementById(EXTRACTION_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = EXTRACTION_STYLE_ID;
  style.textContent = `
    @keyframes gq-scan {
      0%   { transform: translateY(-100%); opacity: 0; }
      10%  { opacity: 1; }
      90%  { opacity: 1; }
      100% { transform: translateY(100%); opacity: 0; }
    }
    @keyframes gq-shimmer {
      0%   { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes gq-pulse-ring {
      0%   { transform: scale(1);   opacity: 0.6; }
      50%  { transform: scale(1.08); opacity: 0.25; }
      100% { transform: scale(1);   opacity: 0.6; }
    }
    @keyframes gq-orbit {
      0%   { transform: rotate(0deg)   translateX(52px) rotate(0deg);   opacity: 0.7; }
      50%  { transform: rotate(180deg) translateX(52px) rotate(-180deg); opacity: 1; }
      100% { transform: rotate(360deg) translateX(52px) rotate(-360deg); opacity: 0.7; }
    }
    @keyframes gq-orbit-reverse {
      0%   { transform: rotate(0deg)   translateX(44px) rotate(0deg);   opacity: 0.5; }
      50%  { transform: rotate(-180deg) translateX(44px) rotate(180deg); opacity: 0.9; }
      100% { transform: rotate(-360deg) translateX(44px) rotate(360deg); opacity: 0.5; }
    }
    @keyframes gq-dot-pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50%      { opacity: 1;   transform: scale(1.2); }
    }
  `;
  document.head.appendChild(style);
}

function removeExtractionStyles() {
  document.getElementById(EXTRACTION_STYLE_ID)?.remove();
}

/* ── Extraction indicator component ─────────────────────────────────────── */
function ExtractionIndicator({ mode, isExtracting }: { mode: string; isExtracting: boolean }) {
  const shimmerText =
    mode === "screenshot"
      ? "Capturing"
      : isExtracting
        ? "Extracting text"
        : "Recognizing text";
  return (
    <div className="relative flex flex-col items-center gap-3">
      {/* Orbiting particles */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ width: 120, height: 120 }}>
        <div
          className="absolute rounded-full"
          style={{
            width: 5,
            height: 5,
            background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
            animation: "gq-orbit 3s linear infinite",
            boxShadow: "0 0 8px 2px rgba(96,165,250,0.4)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 4,
            height: 4,
            background: "linear-gradient(135deg, #c084fc, #22d3ee)",
            animation: "gq-orbit-reverse 4s linear infinite",
            boxShadow: "0 0 6px 2px rgba(192,132,252,0.35)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 3,
            height: 3,
            background: "#22d3ee",
            animation: "gq-orbit 5s linear infinite",
            boxShadow: "0 0 6px 1px rgba(34,211,238,0.3)",
          }}
        />
      </div>

      {/* Pulsing outer ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: 180,
          height: 48,
          border: "1px solid rgba(139,92,246,0.25)",
          animation: "gq-pulse-ring 2s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* Main pill with gradient border */}
      <div className="relative rounded-full p-[1px]" style={{
        background: "linear-gradient(135deg, #3b82f6, #8b5cf6, #06b6d4, #3b82f6)",
        backgroundSize: "300% 300%",
        animation: "gq-shimmer 3s linear infinite",
      }}>
        <div className="rounded-full bg-black/85 backdrop-blur-md px-5 py-2.5 flex items-center gap-3 shadow-2xl">
          {/* Scanning line inside pill */}
          <div className="relative overflow-hidden" style={{ width: 18, height: 18 }}>
            <div
              className="absolute inset-0 rounded"
              style={{
                background: "linear-gradient(180deg, transparent, rgba(96,165,250,0.6), transparent)",
                animation: "gq-scan 1.4s ease-in-out infinite",
              }}
            />
            {/* Static scan icon */}
            <svg viewBox="0 0 18 18" fill="none" className="relative z-10" style={{ width: 18, height: 18 }}>
              <rect x="2" y="2" width="14" height="14" rx="2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
              <line x1="2" y1="6" x2="16" y2="6" stroke="rgba(96,165,250,0.7)" strokeWidth="1" />
              <line x1="2" y1="10" x2="16" y2="10" stroke="rgba(139,92,246,0.5)" strokeWidth="0.8" />
            </svg>
          </div>

          {/* Shimmer text */}
          <span
            className="text-sm font-semibold"
            style={{
              background: "linear-gradient(90deg, #94a3b8 0%, #e2e8f0 25%, #94a3b8 50%, #e2e8f0 75%, #94a3b8 100%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              animation: "gq-shimmer 2.5s linear infinite",
            }}
          >
            {shimmerText}
          </span>

          {/* Animated dots */}
          <span className="flex gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                  animation: `gq-dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

function log(msg: string) {
  invoke("log_frontend", { message: msg }).catch(() => {});
}

function stringifyUnknown(value: unknown): string {
  if (value instanceof Error) {
    const message = value.message.trim();
    const cause = "cause" in value ? errorToDisplayMessage(value.cause) : "";

    if (message && cause) return `${message}. Cause: ${cause}`;
    return message || cause;
  }

  if (typeof value === "string") return value.trim();

  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value).trim();
}

function errorToDisplayMessage(value: unknown): string {
  const message = stringifyUnknown(value).trim();
  if (!message || message === "undefined" || message === "null") {
    return UNKNOWN_AI_OCR_ERROR;
  }

  return message;
}

export default function Selector() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<string>("screenshot");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef("screenshot");

  const closeSelector = () => {
    invoke("close_selector").catch(() => {
      getCurrentWindow().close().catch(() => {});
    });
  };

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("AI OCR timed out after 45 seconds.")), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const setSelectorMode = (nextMode: string) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  };

  const getAiOcrConfigSnapshot = () => {
    const provider = localStorage.getItem("api-provider") || "openai";
    const model = localStorage.getItem("selected-model") || "";
    const apiKey = localStorage.getItem("api-key") || "";

    return {
      provider,
      hasModel: model.trim().length > 0,
      hasApiKey: apiKey.trim().length > 0,
    };
  };

  const showOcrError = (message: string) => {
    log(`AI OCR failed: ${message}`);
    setIsCapturing(false);
    setIsExtracting(false);
    setOcrError(message);
    getCurrentWindow().show();
    getCurrentWindow().setFocus();
    window.focus();
    containerRef.current?.focus();
  };

  useEffect(() => {
    log("Selector mounted");
    ensureExtractionStyles();
    // Focus the Tauri window natively
    getCurrentWindow().setFocus();
    // Also focus the DOM
    window.focus();
    containerRef.current?.focus();

    // Get initial mode from URL
    const params = new URLSearchParams(window.location.search);
    const initialMode = params.get("mode");
    if (initialMode) {
      log("Initial mode: " + initialMode);
      setSelectorMode(initialMode);
    }

    // Listen for mode changes if window is reused
    const unlisten = listen<string>("set-mode", (event) => {
      log("set-mode event: " + event.payload);
      setSelectorMode(event.payload);
      setIsCapturing(false);
      setIsExtracting(false);
      setOcrError(null);
      setStart(null);
      setCurrent(null);
      getCurrentWindow().show();
      getCurrentWindow().setFocus();
      window.focus();
      containerRef.current?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.code === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        log("Escape pressed, closing selector");
        closeSelector();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    const ocrImageReady = listen<string>("ocr-image-ready", async (event) => {
      if (modeRef.current !== "ocr") {
        log("ocr-image-ready ignored: mode=" + modeRef.current);
        return;
      }

      try {
        setOcrError(null);
        setIsCapturing(true);
        setIsExtracting(true);
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
        window.focus();
        const ocrConfig = getAiOcrConfigSnapshot();
        log(
          `AI OCR extraction started provider=${ocrConfig.provider} modelConfigured=${ocrConfig.hasModel} apiKeyConfigured=${ocrConfig.hasApiKey}`
        );

        const ocrResult = await withTimeout(performAiOcrResult(event.payload), AI_OCR_TIMEOUT_MS);

        if (!ocrResult.ok) {
          log("AI OCR result classification=error");
          showOcrError(ocrResult.error);
          return;
        }

        const ocrText = ocrResult.text.trim();
        if (!ocrText) {
          showOcrError("AI OCR returned an empty response.");
          return;
        }

        log(`AI OCR result classification=success length=${ocrText.length}`);
        try {
          await writeText(ocrText);
        } catch (clipboardErr) {
          showOcrError(
            `OCR succeeded, but copying text to the clipboard failed: ${errorToDisplayMessage(clipboardErr)}`
          );
          return;
        }
        log(`AI OCR text copied to clipboard length=${ocrText.length}`);
        setIsExtracting(false);
        setTimeout(closeSelector, 150);
      } catch (err) {
        showOcrError(errorToDisplayMessage(err));
      }
    });

    const ocrErrorReady = listen<string>("ocr-error", (event) => {
      showOcrError(event.payload || "OCR failed before text extraction could start.");
    });
    
    return () => {
      unlisten.then(f => f());
      ocrImageReady.then(f => f());
      ocrErrorReady.then(f => f());
      document.removeEventListener("keydown", handleKeyDown);
      removeExtractionStyles();
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (isCapturing) {
      log("mouseDown ignored: isCapturing=true");
      return;
    }
    log("mouseDown: " + e.clientX + "," + e.clientY);
    setStart({ x: e.clientX, y: e.clientY });
    setCurrent({ x: e.clientX, y: e.clientY });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (start && !isCapturing) {
      setCurrent({ x: e.clientX, y: e.clientY });
    }
  };

  const onMouseUp = () => {
    log("mouseUp fired");
    if (start && current && !isCapturing) {
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const width = Math.abs(start.x - current.x);
      const height = Math.abs(start.y - current.y);

      log("mouseUp selection: x=" + x + " y=" + y + " w=" + width + " h=" + height);

      if (width > 2 && height > 2) {
        // Immediately hide selection div from DOM before capture
        if (selectionRef.current) {
          selectionRef.current.style.display = 'none';
        }

        // Force synchronous React state update
        flushSync(() => {
          setIsCapturing(true);
          setStart(null);
          setCurrent(null);
        });

        log("mouseUp: about to call capture_region in 25ms");

        // Brief pause for browser paint before invoking capture
        setTimeout(() => {
          const captureMode = modeRef.current;
          const ocrEngine = localStorage.getItem("ocr-engine") || "tesseract";
          log("mouseUp: invoking capture_region");
          invoke("capture_region", {
            x: Math.floor(x),
            y: Math.floor(y),
            width: Math.floor(width),
            height: Math.floor(height),
            mode: captureMode,
            ocrEngine,
          })
            .then((result) => {
              log("capture_region success: " + result);
              // Rust closes the window
            })
            .catch((err) => {
              log("capture_region FAILED: " + err);
              setIsCapturing(false);
              if (captureMode === "ocr") {
                showOcrError(errorToDisplayMessage(err));
              } else {
                getCurrentWindow().show();
                window.focus();
              }
            });
        }, 25);
      } else {
        log("mouseUp: region too small, resetting");
        setStart(null);
        setCurrent(null);
      }
    } else if (!isCapturing) {
      log("mouseUp: no selection, resetting");
      setStart(null);
      setCurrent(null);
    } else {
      log("mouseUp ignored: isCapturing=true");
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="fixed inset-0 cursor-crosshair bg-black/10 select-none outline-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {!isCapturing && start && current && (
        <div
          ref={selectionRef}
          className="absolute border-2 border-blue-500 bg-blue-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]"
          style={{
            left: Math.min(start.x, current.x),
            top: Math.min(start.y, current.y),
            width: Math.abs(start.x - current.x),
            height: Math.abs(start.y - current.y),
          }}
        />
      )}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        {isCapturing ? (
          <ExtractionIndicator mode={mode} isExtracting={isExtracting} />
        ) : (
          <div className="rounded-full bg-black/80 px-4 py-2 text-sm font-medium text-white backdrop-blur-md border border-white/10 shadow-2xl">
            {isCapturing ? "Processing..." : mode === "ocr" ? "Select text to recognize" : "Select region to capture"}
          </div>
        )}
        {!isCapturing && (
          <div className="text-[11px] font-bold text-white/70 bg-black/50 px-3 py-1 rounded-full uppercase tracking-wider border border-white/5">
            ESC to cancel
          </div>
        )}
      </div>
      {ocrError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/35 px-6 cursor-default"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-950/95 p-5 text-white shadow-2xl backdrop-blur-xl">
            <h2 className="text-base font-semibold">OCR failed</h2>
            <p className="mt-2 text-sm leading-6 text-white/75">{ocrError}</p>
            <button
              className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              onClick={(e) => {
                e.stopPropagation();
                closeSelector();
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
