#!/usr/bin/env node
/**
 * scripts/bundle.js
 *
 * Build pipeline:
 *  1. esbuild → bundles all ESM source into a single CJS file (dist/.bundle.cjs)
 *  2. @yao-pkg/pkg → compiles the bundle into a standalone binary
 *
 * Usage:
 *   node scripts/bundle.js             # linux x64 (default)
 *   node scripts/bundle.js --arm       # linux arm64
 *   node scripts/bundle.js --all       # linux x64 + arm64 + macos + windows
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const DIST      = path.join(ROOT, "dist");
const ENTRY     = path.join(ROOT, "bin", "hana.js");   // absolute — fixes Windows + any cwd
const BUNDLE    = path.join(DIST, ".bundle.cjs");

const args = process.argv.slice(2);
const ALL  = args.includes("--all");
const ARM  = args.includes("--arm");

const TARGETS = ALL
  ? ["node18-linux-x64", "node18-linux-arm64", "node18-macos-x64", "node18-win-x64"]
  : ARM
  ? ["node18-linux-arm64"]
  : ["node18-linux-x64"];

const OUTPUT_NAMES = {
  "node18-linux-x64"  : "hana",
  "node18-linux-arm64": "hana-arm64",
  "node18-macos-x64"  : "hana-macos",
  "node18-win-x64"    : "hana.exe",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Quote a path so spaces don't break shell on any OS */
function q(p) {
  return `"${p}"`;
}

/** Run a command, printing it first, inheriting stdio */
function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// ─── Step 0: ensure dist/ exists ─────────────────────────────────────────────
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

// ─── Step 1: esbuild  (ESM → single CJS bundle) ──────────────────────────────
console.log("\n📦  Bundling with esbuild…");
run(
  [
    "npx esbuild",
    q(ENTRY),                   // absolute path — no more "could not resolve"
    "--bundle",
    "--platform=node",
    "--target=node18",
    "--format=cjs",
    `--outfile=${q(BUNDLE)}`,
    "--external:fsevents",      // macOS-only native module, safe to skip
  ].join(" ")
);
console.log(`   → ${BUNDLE}\n`);

// ─── Step 2: pkg  (CJS bundle → standalone binary) ───────────────────────────
for (const target of TARGETS) {
  const outName = OUTPUT_NAMES[target] || "hana";
  const outFile = path.join(DIST, outName);
  console.log(`🔨  Compiling binary  [${target}]  →  ${outFile}`);
  run(
    [
      "npx pkg",
      q(BUNDLE),
      `--target ${target}`,
      `--output ${q(outFile)}`,
      "--compress GZip",
    ].join(" ")
  );
}

console.log("\n✅  Done! Binaries are in ./dist/");
if (TARGETS.includes("node18-linux-x64")) {
  console.log("    Linux:   chmod +x dist/hana && ./dist/hana --help");
}
if (TARGETS.includes("node18-win-x64")) {
  console.log("    Windows: dist\\hana.exe --help");
}
console.log();
