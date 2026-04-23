#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const env = { ...process.env };

if (process.platform === "darwin" && !env.CI) {
  for (const key of [
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_ID",
    "APPLE_PASSWORD",
    "APPLE_SIGNING_IDENTITY",
    "APPLE_TEAM_ID",
    "APPLE_API_ISSUER",
    "APPLE_API_KEY",
    "APPLE_API_KEY_PATH",
  ]) {
    delete env[key];
  }
}

const bin =
  process.platform === "win32"
    ? path.join(process.cwd(), "node_modules", ".bin", "tauri.cmd")
    : path.join(process.cwd(), "node_modules", ".bin", "tauri");

const result = spawnSync(bin, process.argv.slice(2), {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
