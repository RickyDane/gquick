import { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  X,
  RefreshCw,
} from "lucide-react";
import { Update } from "@tauri-apps/plugin-updater";
import {
  checkForUpdates,
  downloadAndInstall,
  relaunchApp,
  type UpdateStatus,
  type UpdateInfo,
} from "../utils/updater";

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When true, the modal was triggered by auto-check on startup.
   *  If the parent already checked and found an update, it can pass
   *  pre-fetched info via `initialInfo` to avoid a redundant second check. */
  autoCheck?: boolean;
  /** Pre-fetched update info from parent (avoids double-checking). */
  initialInfo?: UpdateInfo;
  /** Pre-fetched Update object from parent. */
  initialUpdate?: Update;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function UpdateModal({
  isOpen,
  onClose,
  autoCheck = false,
  initialInfo,
  initialUpdate,
}: UpdateModalProps) {
  const [status, setStatus] = useState<UpdateStatus>(() => {
    if (initialInfo && initialUpdate) return "available";
    if (autoCheck) return "checking";
    return "idle";
  });
  const [update, setUpdate] = useState<Update | null>(initialUpdate ?? null);
  const [info, setInfo] = useState<UpdateInfo | null>(initialInfo ?? null);
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doCheck = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("checking");
    setError(null);
    setUpdate(null);
    setInfo(null);
    setProgress(null);

    const result = await checkForUpdates();
    if (!mountedRef.current) return;

    if (result.available && result.update && result.info) {
      setUpdate(result.update);
      setInfo(result.info);
      setStatus("available");
    } else if (result.error) {
      setError(result.error);
      setStatus("error");
    } else {
      setStatus("not-available");
    }
  }, []);

  const doDownload = useCallback(async () => {
    if (!update || !mountedRef.current) return;
    setStatus("downloading");
    setError(null);
    setProgress({ downloaded: 0, total: 0 });

    const result = await downloadAndInstall(
      update,
      (downloaded, total) => {
        if (mountedRef.current) setProgress({ downloaded, total });
      }
    );

    if (!mountedRef.current) return;

    if (result.success) {
      setStatus("downloaded");
    } else {
      setError(result.error);
      setStatus("error");
    }
  }, [update]);

  const doRelaunch = useCallback(async () => {
    try {
      await relaunchApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Auto-check on mount when triggered by startup (skip if parent already provided info)
  useEffect(() => {
    if (isOpen && autoCheck && !initialInfo) {
      void doCheck();
    }
  }, [isOpen, autoCheck, doCheck, initialInfo]);

  // Focus management
  useEffect(() => {
    if (!isOpen) return;
    if (status === "available" || status === "error" || status === "not-available") {
      actionButtonRef.current?.focus();
    } else {
      closeButtonRef.current?.focus();
    }
  }, [isOpen, status]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const percent =
    progress && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        className="w-full max-w-sm rounded-2xl bg-zinc-950/95 border border-white/10 shadow-2xl shadow-black/40 p-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <span className="h-7 w-7 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Download className="h-4 w-4" />
            </span>
            <h2 id="update-dialog-title">Software Update</h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-4">
          {/* Checking */}
          {status === "checking" && (
            <div className="flex items-center gap-3 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <span className="text-sm">Checking for updates...</span>
            </div>
          )}

          {/* Available */}
          {status === "available" && info && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-200">
                Update available:{" "}
                <span className="font-semibold text-blue-400">
                  v{info.version}
                </span>
              </p>
              {info.body && (
                <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-lg bg-zinc-900/50 border border-white/5 p-3 text-xs text-zinc-400 leading-5 whitespace-pre-wrap">
                  {info.body}
                </div>
              )}
              <button
                ref={actionButtonRef}
                onClick={doDownload}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            </div>
          )}

          {/* Not available */}
          {status === "not-available" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-zinc-300">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-sm">
                  You're running the latest version.
                </span>
              </div>
              <button
                ref={actionButtonRef}
                onClick={onClose}
                className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          )}

          {/* Downloading */}
          {status === "downloading" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-zinc-300">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                <span className="text-sm">Downloading update...</span>
              </div>
              {progress && (
                <div className="space-y-1.5">
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-zinc-500">
                    <span>{percent}%</span>
                    <span>
                      {formatBytes(progress.downloaded)}
                      {progress.total > 0 && ` / ${formatBytes(progress.total)}`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Downloaded */}
          {status === "downloaded" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-zinc-300">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-sm">
                  Update downloaded. Ready to install.
                </span>
              </div>
              <button
                ref={actionButtonRef}
                onClick={doRelaunch}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Install & Restart
              </button>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 text-zinc-300">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm">Update check failed</p>
                  <p className="text-xs text-zinc-500 mt-1">{error}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  ref={actionButtonRef}
                  onClick={doCheck}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Idle (manual trigger, waiting for user to click check) */}
          {status === "idle" && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                Check for the latest version of GQuick.
              </p>
              <button
                ref={actionButtonRef}
                onClick={doCheck}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Check for Updates
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
