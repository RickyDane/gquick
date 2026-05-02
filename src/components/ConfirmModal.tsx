import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
      // Small delay to ensure portal is rendered
      requestAnimationFrame(() => deleteBtnRef.current?.focus());
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        onKeyDown={handleKeyDown}
        className="relative z-10 w-full max-w-sm mx-4 bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-400" />
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

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-white/10 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            ref={deleteBtnRef}
            onClick={onConfirm}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
