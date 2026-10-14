#!/usr/bin/env node
/**
 * Runs the Grok app-builder template's own tests (scripts/*.test.mjs).
 *
 * A few of them check that the project still has the blank template's
 * defaults: sign-in off, no app name, no migrations of its own. Pence changed
 * those on purpose, so those checks are left out here, by name. Every other
 * template test runs and must pass.
 */
import { spawnSync } from "node:child_process";

const BLANK_TEMPLATE_DEFAULTS = [
  // Pence has sign-in on.
  "the build side resolves the template's shipped app-env",
  "the template ships auth off",
  "the wrapped command runs with the app env applied",
  "the CLI still runs when invoked through a symlinked path",
  // Pence has its own migrations beside the auth schema.
  "the auth schema ships outside the globbed directory",
  // Pence has its own name in src/lib/og/site.json, which wins over a page's title.
  "platform chrome overwrites share-card metas and always sets og:title",
  "published grok.me slug is still a title fallback",
  "document title entities are not double-escaped on og:title",
  "injects into documents with no head element",
  "streaming injector matches </HEAD> case-insensitively",
  "uses the app name in the injected title tag",
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = `^(${BLANK_TEMPLATE_DEFAULTS.map(escape).join("|")})$`;
const run = spawnSync(process.execPath, ["--test", `--test-skip-pattern=${pattern}`, "scripts/**/*.test.mjs"], { stdio: "inherit" });
process.exit(run.status ?? 1);
