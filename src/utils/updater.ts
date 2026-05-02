import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateInfo {
  version: string;
  body: string | null;
}

export interface UpdateState {
  status: UpdateStatus;
  update: Update | null;
  info: UpdateInfo | null;
  progress: { downloaded: number; total: number } | null;
  error: string | null;
}

export async function checkForUpdates(): Promise<{
  available: boolean;
  update: Update | null;
  info: UpdateInfo | null;
  error: string | null;
}> {
  try {
    const update = await check();
    if (update) {
      return {
        available: true,
        update,
        info: {
          version: update.version,
          body: update.body ?? null,
        },
        error: null,
      };
    }
    return { available: false, update: null, info: null, error: null };
  } catch (err) {
    return {
      available: false,
      update: null,
      info: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function downloadAndInstall(
  update: Update,
  onProgress: (downloaded: number, total: number) => void
): Promise<{ success: boolean; error: string | null }> {
  try {
    let contentLength = 0;
    let downloaded = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength ?? 0;
          onProgress(0, contentLength);
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          onProgress(downloaded, contentLength);
          break;
        case "Finished":
          onProgress(contentLength, contentLength);
          break;
      }
    });

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}
