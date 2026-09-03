#!/usr/bin/env node
// Drift guard for the shared MyaThida design contract.
//
// design/tokens.css and DESIGN.md must be byte-identical across all three
// repos (PointSystem_AkoATP, Billiards_MyaThida, MyaThida_Game). This script
// is the same file, run from any one of the three, and diffs the local copy
// against the other two sibling repos found next to it on disk.
//
// Exit 0: all copies match. Exit 1: at least one file has drifted, or a
// sibling repo isn't found (reported as a warning, not a failure, since a
// dev machine may only have one repo checked out).
//
// Usage: node scripts/check-design-sync.mjs

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF_DIR = dirname(dirname(fileURLToPath(import.meta.url))); // repo root
const SIBLINGS = ["PointSystem_AkoATP", "Billiards_MyaThida", "MyaThida_Game"];
const TRACKED_FILES = ["design/tokens.css", "DESIGN.md"];

const selfName = basename(SELF_DIR);
const parentDir = dirname(SELF_DIR);

let hadMismatch = false;
let hadMissingSibling = false;

for (const siblingName of SIBLINGS) {
  if (siblingName === selfName) continue;
  const siblingDir = resolve(parentDir, siblingName);

  if (!existsSync(siblingDir)) {
    console.warn(`WARN  sibling repo not found next to this one: ${siblingDir}`);
    hadMissingSibling = true;
    continue;
  }

  for (const relPath of TRACKED_FILES) {
    const localPath = join(SELF_DIR, relPath);
    const siblingPath = join(siblingDir, relPath);

    if (!existsSync(localPath)) {
      console.error(`FAIL  missing locally: ${relPath}`);
      hadMismatch = true;
      continue;
    }
    if (!existsSync(siblingPath)) {
      console.error(`FAIL  ${siblingName} is missing: ${relPath}`);
      hadMismatch = true;
      continue;
    }

    const local = readFileSync(localPath, "utf8");
    const sibling = readFileSync(siblingPath, "utf8");

    if (local !== sibling) {
      console.error(`FAIL  ${relPath} differs from ${siblingName}`);
      hadMismatch = true;
    } else {
      console.log(`OK    ${relPath} matches ${siblingName}`);
    }
  }
}

if (hadMismatch) {
  console.error(
    "\nDesign contract has drifted. Pick the correct version, copy it over " +
      "the other two repos' matching file, and re-run this script."
  );
  process.exit(1);
}

if (hadMissingSibling) {
  console.warn(
    "\nCould not check every sibling repo (see WARN lines above). No " +
      "mismatch found in what was checked."
  );
}

console.log("\nDesign contract in sync.");
