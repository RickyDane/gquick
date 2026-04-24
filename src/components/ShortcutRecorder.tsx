import { useState, useRef, useEffect, useCallback } from "react";
import { Keyboard } from "lucide-react";

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  placeholder?: string;
}

const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

function formatShortcutForDisplay(shortcut: string): string {
  return shortcut
    .replace("CmdOrCtrl", isMac ? "⌘" : "Ctrl")
    .replace("Alt", "Alt")
    .replace("Shift", "Shift")
    .replace("Space", "Space")
    .replace(/\+/g, " + ");
}

export default function ShortcutRecorder({
  value,
  onChange,
  placeholder = "Click to record shortcut",
}: ShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      // Cancel recording with Escape
      if (e.key === "Escape") {
        setIsRecording(false);
        return;
      }

      // Ignore lone modifier keys
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        return;
      }

      const modifiers: string[] = [];

      if (e.metaKey) {
        modifiers.push("CmdOrCtrl");
      } else if (e.ctrlKey) {
        modifiers.push("CmdOrCtrl");
      }

      if (e.altKey) modifiers.push("Alt");
      if (e.shiftKey) modifiers.push("Shift");

      // Must have at least one modifier for global shortcuts
      if (modifiers.length === 0) {
        return;
      }

      let key = e.key;

      // Map special keys
      if (key === " ") key = "Space";
      else if (key === "Enter") key = "Enter";
      else if (key === "Tab") key = "Tab";
      else if (key.length === 1) key = key.toUpperCase();
      else {
        // For other keys like ArrowUp, Delete, etc. — skip for now
        return;
      }

      const shortcut = [...modifiers, key].join("+");
      onChange(shortcut);
      setIsRecording(false);
    },
    [isRecording, onChange]
  );

  useEffect(() => {
    if (isRecording) {
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [isRecording, handleKeyDown]);

  // Click outside to cancel recording
  useEffect(() => {
    if (!isRecording) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsRecording(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isRecording]);

  return (
    <div ref={containerRef} className="w-full">
      <button
        onClick={() => setIsRecording(!isRecording)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm border transition-all cursor-pointer ${
          isRecording
            ? "bg-blue-500/20 border-blue-500/50 text-blue-400 ring-1 ring-blue-500/30"
            : "bg-zinc-800 border-white/10 text-zinc-200 hover:border-white/20"
        }`}
      >
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-zinc-400" />
          <span>
            {isRecording
              ? "Recording... press shortcut"
              : value
              ? formatShortcutForDisplay(value)
              : placeholder}
          </span>
        </div>
        {isRecording && (
          <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">
            ESC to cancel
          </span>
        )}
      </button>
    </div>
  );
}
