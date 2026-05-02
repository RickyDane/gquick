import { useEffect, useRef, useCallback } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus delete button on open
  useEffect(() => {
    if (isOpen) {
      // Wait until the modal panel is rendered before moving focus.
      requestAnimationFrame(() => deleteBtnRef.current?.focus());
    }
  }, [isOpen]);

  // Close on Escape before app-level shortcuts can handle the key.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [isOpen, onCancel]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;

      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    []
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        onKeyDown={handleKeyDown}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="relative z-10 w-full max-w-sm rounded-2xl bg-zinc-950/95 border border-white/10 shadow-2xl shadow-black/40 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="confirm-modal-title"
              className="text-sm font-semibold text-zinc-100"
            >
              {title}
            </h2>
            <p
              id="confirm-modal-desc"
              className="mt-2 text-xs text-zinc-400 leading-relaxed"
            >
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 cursor-pointer border border-white/10 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            Cancel
          </button>
          <button
            ref={deleteBtnRef}
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
