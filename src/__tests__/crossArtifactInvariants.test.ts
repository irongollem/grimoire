/**
 * Cross-artifact invariants — the class of defect the rest of the suite is
 * structurally unable to see.
 *
 * Every check here guards a name in one file that has to agree with something
 * in a *different* file, where neither file is wrong on its own: a template
 * string against a CSS class, a string literal against markdown frontmatter, a
 * function's name against what its body actually talks to. `vue-tsc` cannot
 * follow any of those seams, so a rename can break them while typecheck, lint,
 * the test suite and the build all stay green.
 *
 * Each case below is a real regression from the #583 `srd_` -> `library_`
 * rename, all of which shipped through a fully green suite and were caught by
 * human review instead. They are cheap to assert and they do not go stale, so
 * they are asserted.
 *
 * These read the repo from disk rather than importing modules. That is the
 * point: the bugs live in the text of files that never import each other.
 */

/// <reference types="node" />
// This file is under `src/`, so `tsconfig.app.json` owns it — and that config
// deliberately has no `types: ["node"]`, because Node globals must not resolve
// inside browser code. This is the one `src/` file that genuinely runs in Node
// (it shells out to `git ls-files` and reads the repo from disk), so it pulls
// the node types in for itself rather than widening the app config for everyone.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { manualSections } from "@/lib/manualLoader";

// Not `import.meta.url` — under Vitest's module runner that is an http:// URL,
// not a file:// one, so fileURLToPath rejects it. Vitest runs with cwd at the
// project root.
const REPO_ROOT = process.cwd();

/** This file, repo-relative — see the filter in `trackedFiles`. */
const SELF = "src/__tests__/crossArtifactInvariants.test.ts";

/** Tracked files only — never node_modules, dist, or a stray local scratch file. */
function trackedFiles(...globs: string[]): string[] {
  return execFileSync("git", ["ls-files", ...globs], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    // ...and never this file. Every check below greps the repo for a pattern,
    // and documents that pattern in a comment directly above the code that
    // looks for it — `<ManualHelpLink page="literal" />`, `{ tab: "page-id" }`.
    // Those examples are byte-for-byte indistinguishable from real call sites,
    // so scanning ourselves reports our own documentation as dangling refs.
    .filter((f) => f !== SELF);
}

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/** Body of the `{...}` block that starts at or after `from`, brace-matched. */
function braceMatchedBody(source: string, from: number): string {
  const start = source.indexOf("{", from);
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

describe("Vue transition names resolve to real CSS", () => {
  // `<Transition name="x">` makes Vue apply `.x-enter-active`, `.x-leave-to`
  // and friends. Nothing links the two: rename the attribute and the classes
  // simply stop matching, so the element teleports instead of animating. No
  // error, no warning, nothing a type checker or a test can notice.
  //
  // This is exactly what happened to LibraryArtPreviewModal in #583 — the
  // string sweep renamed `name="srd-preview"` and left `.srd-preview-*` behind.
  //
  // Repo-wide rather than per-file on purpose: 12 components use a shared name
  // (`fade`, `dialog-fade`, `slide-right`) whose CSS lives in a sibling.
  it("every transition name has matching enter/leave CSS somewhere in src/", () => {
    const files = trackedFiles("src/**/*.vue", "src/**/*.css");
    const allSource = files.map(read).join("\n");

    const usages = new Map<string, string>(); // name -> first file using it
    for (const file of files) {
      for (const m of read(file).matchAll(/<Transition(?:Group)?[^>]*\bname="([a-z0-9-]+)"/g)) {
        if (!usages.has(m[1])) usages.set(m[1], file);
      }
    }
    expect(usages.size).toBeGreaterThan(0);

    const orphaned = [...usages]
      .filter(([name]) => !new RegExp(`\\.${name}-(enter|leave)`).test(allSource))
      .map(([name, file]) => `<Transition name="${name}"> in ${file} — no .${name}-enter/.${name}-leave CSS`);

    expect(orphaned).toEqual([]);
  });
});

describe("manual page ids resolve to real manual pages", () => {
  // `<ManualHelpLink page="x">` looks `x` up in the pages built by
  // manualLoader, whose id is `slugify(frontmatter title)`. A bad id renders a
  // help link that opens nothing.
  //
  // #583's `"srd-*"` -> `"library-*"` string sweep hit `"srd-compendium"`,
  // which is a manual id and not a query key, and broke the Reliquary's help
  // link. Nothing referenced it in a typed position, so nothing complained.
  it("every referenced page id exists", () => {
    const valid = new Set(manualSections.flatMap((s) => s.pages.map((p) => p.id)));
    expect(valid.size).toBeGreaterThan(0);

    const referenced = new Map<string, string>(); // id -> file
    for (const file of trackedFiles("src/**/*.vue", "src/**/*.ts")) {
      const source = read(file);

      // <ManualHelpLink page="literal" />
      for (const m of source.matchAll(/<ManualHelpLink[^>]*\bpage="([a-z0-9-]+)"/g)) {
        if (!referenced.has(m[1])) referenced.set(m[1], file);
      }

      // const MANUAL_PAGE_BY_TAB = { tab: "page-id", ... }
      const table = source.indexOf("MANUAL_PAGE_BY_TAB");
      if (table !== -1) {
        for (const m of braceMatchedBody(source, table).matchAll(/:\s*"([a-z0-9-]+)"/g)) {
          if (!referenced.has(m[1])) referenced.set(m[1], file);
        }
      }
    }
    expect(referenced.size).toBeGreaterThan(0);

    const dangling = [...referenced]
      .filter(([id]) => !valid.has(id))
      .map(([id, file]) => `"${id}" referenced in ${file} is not a manual page id`);

    expect(dangling).toEqual([]);
  });
});

describe("fetch* names match the data source they actually read", () => {
  // The repo runs two families with near-identical names on either side of one
  // line: `fetchOpen5e*` goes over HTTP to api.open5e.com, `fetchLibrary*`
  // reads our own `library_*` tables. Both were called `fetchSrd*` before #583,
  // and because the same verb sat on both sides, a rename mapping one token to
  // one target labelled both directions backwards — `fetchOpen5eMonsters`
  // reading Supabase, `fetchLibrarySpells` calling the Open5e API. Both
  // compiled, both passed every test: the names were wrong, not the code.
  //
  // Asserted as a negative for Open5e (must not touch a library table) and a
  // positive for Library (must). Deliberately not "Open5e must make an HTTP
  // call" — those go through several helpers and a URL constant, so that shape
  // is guesswork; the library-table access is unambiguous either way.
  it("fetchLibrary* reads a library_ table and fetchOpen5e* does not", () => {
    const readsLibraryTable = /\.from\(\s*"library_/;
    const violations: string[] = [];
    let checked = 0;

    for (const file of trackedFiles("src/**/*.ts", "src/**/*.vue", "scripts/**/*.ts")) {
      const source = read(file);
      for (const m of source.matchAll(/\b(fetch(?:Open5e|Library)\w*)\s*(?=\()/g)) {
        // Only declarations, not call sites.
        if (!/(?:function|const)\s+$/.test(source.slice(Math.max(0, m.index - 40), m.index))) continue;

        checked++;
        const body = braceMatchedBody(source, m.index);
        const touchesLibrary = readsLibraryTable.test(body);

        if (m[1].startsWith("fetchOpen5e") && touchesLibrary) {
          violations.push(`${m[1]} (${file}) is named for Open5e but reads a library_ table`);
        }
        if (m[1].startsWith("fetchLibrary") && !touchesLibrary) {
          violations.push(`${m[1]} (${file}) is named for the library but reads no library_ table`);
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
