import { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export default function Selector() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<string>("screenshot");
  const [isCapturing, setIsCapturing] = useState(false);
  const selectionRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the Tauri window natively
    getCurrentWindow().setFocus();
    // Also focus the DOM
    window.focus();
    containerRef.current?.focus();

    // Get initial mode from URL
    const params = new URLSearchParams(window.location.search);
    const initialMode = params.get("mode");
    if (initialMode) {
      setMode(initialMode);
    }

    // Listen for mode changes if window is reused
    const unlisten = listen<string>("set-mode", (event) => {
      setMode(event.payload);
      setIsCapturing(false);
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
        // Use Rust command for reliable close
        invoke("close_selector").catch(() => {
          // Fallback
          getCurrentWindow().close().catch(() => {});
        });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    
    return () => {
      unlisten.then(f => f());
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (isCapturing) return;
    setStart({ x: e.clientX, y: e.clientY });
    setCurrent({ x: e.clientX, y: e.clientY });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (start && !isCapturing) {
      setCurrent({ x: e.clientX, y: e.clientY });
    }
  };

  const onMouseUp = () => {
    if (start && current && !isCapturing) {
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const width = Math.abs(start.x - current.x);
      const height = Math.abs(start.y - current.y);

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

        // Wait for browser paint before invoking capture
        setTimeout(() => {
          invoke("capture_region", {
            x: Math.floor(x),
            y: Math.floor(y),
            width: Math.floor(width),
            height: Math.floor(height),
            mode: mode
          })
            .then((result) => {
              console.log("Capture success:", result);
              // Rust closes the window
            })
            .catch((err) => {
              console.error("Capture failed:", err);
              setIsCapturing(false);
              // If it failed and didn't close, show it again
              getCurrentWindow().show();
              window.focus();
            });
        }, 100);
      } else {
        setStart(null);
        setCurrent(null);
      }
    } else if (!isCapturing) {
        setStart(null);
        setCurrent(null);
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
        <div className="rounded-full bg-black/80 px-4 py-2 text-sm font-medium text-white backdrop-blur-md border border-white/10 shadow-2xl">
          {isCapturing ? "Processing..." : mode === "ocr" ? "Select text to recognize" : "Select region to capture"}
        </div>
        {!isCapturing && (
          <div className="text-[11px] font-bold text-white/70 bg-black/50 px-3 py-1 rounded-full uppercase tracking-wider border border-white/5">
            ESC to cancel
          </div>
        )}
      </div>
    </div>
  );
}
