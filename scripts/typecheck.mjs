#!/usr/bin/env node
// Type-checks every project tsconfig.json references, each in its own process.
//
// `vue-tsc -b` on the root config builds all of them in ONE process, keeps every
// program in memory until it exits, and adds build mode's incremental state on
// top. On 17 Nov 2026 that ran out of the 6 GB heap the build gave it: main passed
// by a hair (6.6 GB resident) and the first branch to add a few files (#1215) died
// with "JavaScript heap out of memory" in CI. The app program alone now needs
// about 6.5 GB, so each project is checked in its own process with `--noEmit -p`
// (CI starts cold, so build mode's incremental cache bought nothing there), and
// the peak is the largest program rather than the sum of all four. 10 GB leaves
// that program room to grow and still fits the 16 GB ubuntu-latest runner,
// because no two programs are ever alive at once.
//
// The list comes from tsconfig.json's own `references`, so a project added there
// is checked here without anyone remembering this file.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const HEAP_MB = 10240;

const { config, error } = ts.parseConfigFileTextToJson("tsconfig.json", readFileSync("tsconfig.json", "utf8"));
if (error) {
  console.error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  process.exit(1);
}
const projects = (config.references ?? []).map((ref) => ref.path);
if (projects.length === 0) {
  console.error("tsconfig.json references no projects; nothing would be type-checked.");
  process.exit(1);
}

const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${HEAP_MB}`.trim() };
for (const project of projects) {
  const run = spawnSync("npx", ["vue-tsc", "--noEmit", "-p", project], { stdio: "inherit", env });
  if (run.status !== 0) {
    console.error(`vue-tsc failed on ${project}`);
    process.exit(run.status ?? 1);
  }
}
