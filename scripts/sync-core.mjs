#!/usr/bin/env node
/**
 * Pence's logic is Briv's logic. This copies Briv's `packages/core/src` (the
 * rules for categories, pay periods, statements, shops, money sent, budgets and
 * offers) into `src/lib/core`, exactly as it is at the Briv commit pinned in
 * `core.lock.json`. Nothing in `src/lib/core` is edited by hand: change the
 * rule in Briv, then move the pin here.
 *
 *   node scripts/sync-core.mjs            check the copy matches the pin (CI runs this)
 *   node scripts/sync-core.mjs --write    replace the copy with the pinned commit
 *   node scripts/sync-core.mjs --write --commit <sha>   move the pin, then copy
 *
 * Set BRIV_DIR to a local Briv checkout to copy from it instead of GitHub; it
 * must be at the pinned commit.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const lockPath = join(root, "core.lock.json");
const target = join(root, "src/lib/core");
const args = process.argv.slice(2);
const write = args.includes("--write");
const commitArg = args.includes("--commit") ? args[args.indexOf("--commit") + 1] : "";

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
if (commitArg) {
  if (!/^[0-9a-f]{40}$/.test(commitArg)) fail("--commit needs a full 40-character commit id.");
  lock.commit = commitArg;
}

/** The core's own files at the pinned commit: name → content. Tests stay in Briv, which runs them. */
function pinnedFiles() {
  let dir = process.env.BRIV_DIR ? resolve(process.env.BRIV_DIR) : "";
  let cleanup = () => {};
  if (dir) {
    const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (head !== lock.commit) fail(`BRIV_DIR is at ${head.slice(0, 7)}, but core.lock.json pins ${lock.commit.slice(0, 7)}.`);
  } else {
    const tmp = mkdtempSync(join(tmpdir(), "briv-core-"));
    cleanup = () => rmSync(tmp, { recursive: true, force: true });
    const url = `https://codeload.github.com/${lock.repo}/tar.gz/${lock.commit}`;
    const archive = join(tmp, "briv.tar.gz");
    execFileSync("curl", ["-fsSL", "--retry", "3", "-o", archive, url], { stdio: ["ignore", "ignore", "inherit"] });
    execFileSync("tar", ["-xzf", archive, "-C", tmp]);
    const top = readdirSync(tmp).find((name) => name !== "briv.tar.gz");
    if (!top) fail("The Briv download was empty.");
    dir = join(tmp, top);
  }
  try {
    const src = join(dir, lock.path);
    const files = new Map();
    for (const name of readdirSync(src).sort()) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      files.set(name, readFileSync(join(src, name), "utf8"));
    }
    if (files.size === 0) fail(`No core files found at ${lock.path} in ${lock.repo}@${lock.commit.slice(0, 7)}.`);
    return files;
  } finally {
    cleanup();
  }
}

function digest(files) {
  const hash = createHash("sha256");
  for (const [name, text] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) hash.update(`${name}\0${text}\0`);
  return hash.digest("hex");
}

function localFiles() {
  const files = new Map();
  if (!existsSync(target)) return files;
  for (const name of readdirSync(target).sort()) if (name.endsWith(".ts")) files.set(name, readFileSync(join(target, name), "utf8"));
  return files;
}

function fail(message) {
  console.error(`sync-core: ${message}`);
  process.exit(1);
}

const pinned = pinnedFiles();

if (write) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const [name, text] of pinned) writeFileSync(join(target, name), text);
  lock.files = pinned.size;
  lock.sha256 = digest(pinned);
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`sync-core: copied ${pinned.size} files from ${lock.repo}@${lock.commit.slice(0, 7)}.`);
  process.exit(0);
}

const local = localFiles();
const problems = [];
for (const [name, text] of pinned) {
  if (!local.has(name)) problems.push(`missing ${name}`);
  else if (local.get(name) !== text) problems.push(`edited ${name}`);
}
for (const name of local.keys()) if (!pinned.has(name)) problems.push(`extra ${name}`);
if (lock.sha256 && lock.sha256 !== digest(pinned)) problems.push("core.lock.json sha256 does not match the pinned commit");
if (problems.length > 0) {
  fail(
    `src/lib/core is not Briv's core at ${lock.commit.slice(0, 7)}: ${problems.join(", ")}.\n` +
      "Change the rule in Briv, then run: node scripts/sync-core.mjs --write --commit <briv commit>",
  );
}
console.log(`sync-core: src/lib/core matches ${lock.repo}@${lock.commit.slice(0, 7)} (${pinned.size} files).`);
