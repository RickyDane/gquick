#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

if (process.platform !== "darwin") {
  process.exit(0);
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const bundleRoot = path.join(repoRoot, "src-tauri", "macos-bundle");
const frameworksDir = path.join(bundleRoot, "Frameworks");
const tessdataDir = path.join(bundleRoot, "tessdata");
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY?.trim();

fs.rmSync(bundleRoot, { recursive: true, force: true });
fs.mkdirSync(frameworksDir, { recursive: true });
fs.mkdirSync(tessdataDir, { recursive: true });

const seen = new Map();

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function codesign(file) {
  if (signingIdentity) {
    run("codesign", ["--force", "--options", "runtime", "--timestamp", "--sign", signingIdentity, file]);
    return;
  }

  run("codesign", ["--force", "--sign", "-", "--timestamp=none", file]);
}

if (signingIdentity) {
  console.log(`Signing bundled OCR libraries with identity: ${signingIdentity}`);
} else {
  console.log("APPLE_SIGNING_IDENTITY not set; using ad-hoc signing for bundled OCR libraries.");
}

function resolveTesseractPaths() {
  const candidates = [];

  try {
    const prefix = run("brew", ["--prefix", "tesseract"]);
    if (prefix) {
      candidates.push(prefix);
    }
  } catch {
    // Fall back to common Homebrew locations below.
  }

  candidates.push("/opt/homebrew/opt/tesseract", "/usr/local/opt/tesseract");

  for (const prefix of candidates) {
    const libPath = path.join(prefix, "lib", "libtesseract.5.dylib");
    const dataPath = path.join(prefix, "share", "tessdata", "eng.traineddata");
    if (fs.existsSync(libPath) && fs.existsSync(dataPath)) {
      return { tesseractLib: libPath, trainedData: dataPath };
    }
  }

  throw new Error("Could not locate Homebrew Tesseract library and tessdata.");
}

function parseOtoolDeps(file) {
  const output = run("otool", ["-L", file]);
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" (compatibility version")[0])
    .filter(Boolean);
}

function resolveDependency(dep, parentDir) {
  if (dep.startsWith("/")) {
    if (!fs.existsSync(dep)) {
      return null;
    }
    return fs.realpathSync(dep);
  }

  if (dep.startsWith("@rpath/") || dep.startsWith("@loader_path/")) {
    const candidate = path.resolve(parentDir, dep.split("/").pop());
    if (fs.existsSync(candidate)) {
      return fs.realpathSync(candidate);
    }
  }

  return null;
}

function collectLibraries(file) {
  const realFile = fs.realpathSync(file);
  if (seen.has(realFile)) {
    return;
  }

  const basename = path.basename(realFile);
  const destination = path.join(frameworksDir, basename);
  fs.copyFileSync(realFile, destination);
  fs.chmodSync(destination, 0o755);
  seen.set(realFile, destination);

  const parentDir = path.dirname(realFile);
  for (const dep of parseOtoolDeps(realFile)) {
    const resolved = resolveDependency(dep, parentDir);
    if (!resolved) {
      continue;
    }
    if (!resolved.startsWith("/opt/homebrew/") && !resolved.startsWith("/usr/local/")) {
      continue;
    }
    collectLibraries(resolved);
  }
}

const { tesseractLib, trainedData } = resolveTesseractPaths();

collectLibraries(tesseractLib);
fs.copyFileSync(trainedData, path.join(tessdataDir, "eng.traineddata"));

for (const [source, destination] of seen) {
  run("install_name_tool", ["-id", `@loader_path/${path.basename(destination)}`, destination]);
  const parentDir = path.dirname(source);
  for (const dep of parseOtoolDeps(source)) {
    const resolved = resolveDependency(dep, parentDir);
    if (!resolved || !seen.has(resolved)) {
      continue;
    }
    run("install_name_tool", [
      "-change",
      dep,
      `@loader_path/${path.basename(seen.get(resolved))}`,
      destination,
    ]);
  }
  codesign(destination);
}

const executableCandidates = [
  path.join(repoRoot, "src-tauri", "target", "release", "tauri-app"),
  ...fs
    .readdirSync(path.join(repoRoot, "src-tauri", "target"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(repoRoot, "src-tauri", "target", entry.name, "release", "tauri-app")),
].filter((candidate) => fs.existsSync(candidate));

const executablePaths = executableCandidates.filter((candidate, index, all) => all.indexOf(candidate) === index);
for (const executable of executablePaths) {
  for (const dep of parseOtoolDeps(executable)) {
    const basename = path.basename(dep);
    const bundled = [...seen.values()].find((value) => path.basename(value) === basename);
    if (!bundled) {
      continue;
    }
    run("install_name_tool", [
      "-change",
      dep,
      `@executable_path/../Resources/Frameworks/${basename}`,
      executable,
    ]);
  }
  codesign(executable);
}
