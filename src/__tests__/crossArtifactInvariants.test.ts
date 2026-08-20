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
import { parse } from "@vue/compiler-sfc";
import { NodeTypes, type TemplateChildNode } from "@vue/compiler-core";
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

/**
 * Every name this repo can render as a component: the basename of each .vue file,
 * plus every `Icon*` / `Glyph*` the icon barrel re-exports. Deliberately narrow —
 * the point is to catch a real component name sitting in a text node, not to
 * police PascalCase in prose.
 */
const COMPONENT_NAMES = new Set<string>([
  ...trackedFiles("src/**/*.vue").map((f) => path.basename(f, ".vue")),
  ...[...read("src/lib/icons.ts").matchAll(/\bas\s+(Icon[A-Za-z0-9_]+)/g)].map((m) => m[1]),
]);

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

describe("component tags resolve to real imports", () => {

  // A component used in a template but never imported renders as *nothing*. Vue
  // resolves the unknown tag to a bare custom element, the browser draws an empty
  // box, and no tooling objects: `vue-tsc` does not check tag resolution, oxlint
  // has no view of the template, and the build happily emits it. An icon-only
  // button in that state becomes an invisible, unlabelled control.
  //
  // Found four live instances during the #648 sweep — `RecipeEditor` (IconDelete +
  // IconAdd, one of them the sole content of a delete button), `ItemDetail`
  // (DiceExprInput), and `TrapEditor` and `StoreInventory`, which both used
  // AppButton/AppInput with no import at all after the #561 migration. Every one
  // had been shipping through a fully green suite.
  //
  // There are no globally registered components in this app (`app.component(` is
  // never called), so the only legitimate unimported tags are Vue's own built-ins.
  it("every component used in a template is imported", () => {
    const BUILT_IN = new Set([
      "Transition", "TransitionGroup", "KeepAlive", "Teleport", "Suspense",
      "Component", "RouterLink", "RouterView", "Fragment",
    ]);

    const violations: string[] = [];
    let checked = 0;

    for (const file of trackedFiles("src/**/*.vue")) {
      const source = read(file);
      const template = source.match(/<template>([\s\S]*)<\/template>/);
      if (!template) continue;

      // Everything outside the template block: <script setup>, plain <script>, styles.
      const outside =
        source.slice(0, template.index) + source.slice(template.index! + template[0].length);

      for (const tag of new Set([...template[1].matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]))) {
        if (BUILT_IN.has(tag)) continue;
        checked++;

        // Imported by name, via a named/aliased import, or declared locally.
        const bound =
          new RegExp(`\\bimport\\s+${tag}\\b`).test(outside) ||
          new RegExp(`\\bimport\\s*\\{[^}]*\\b${tag}\\b[^}]*\\}`, "s").test(outside) ||
          new RegExp(`\\bas\\s+${tag}\\b`).test(outside) ||
          new RegExp(`\\b(?:const|let|var|function|class)\\s+${tag}\\b`).test(outside);

        if (!bound) violations.push(`${file} uses <${tag}> but never imports it`);
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  // The sibling failure, and a nastier one: a component name written as *prose*
  // rather than as a tag. `IconSend Announcement` in DMAnnounceButton's popover
  // header shipped the literal string "IconSend Announcement" to the screen —
  // no tag, so the import check above cannot see it, and nothing else looks at
  // rendered text at all. It is the only instance in the repo, found by an agent
  // that happened to be reading the file.
  //
  // Parsed rather than regexed: an earlier grep-shaped attempt at this reported
  // three more, and all three were `:icon="IconDelete"` inside multi-line tags
  // that a `<[^>]*>` strip had truncated on a `>` inside an attribute expression.
  // Text nodes are a thing the compiler knows and a regex does not.
  it("no component name is rendered as literal text", () => {
    const violations: string[] = [];
    let checked = 0;

    // The catalogue at /dev/components captions each demo with the component's
    // own name, which is the one place where printing one as text is the point.
    const NAMES_COMPONENTS_ON_PURPOSE = /dev\/(ComponentCatalogueView|CatalogueSection)\.vue$/;

    for (const file of trackedFiles("src/**/*.vue")) {
      if (NAMES_COMPONENTS_ON_PURPOSE.test(file)) continue;
      const { descriptor } = parse(read(file), { filename: file });
      if (!descriptor.template) continue;
      checked++;

      const walk = (nodes: TemplateChildNode[]): void => {
        for (const node of nodes) {
          if (node.type === NodeTypes.TEXT) {
            for (const word of node.content.match(/\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/g) ?? []) {
              // PascalCase in prose is normally a proper noun ("Forgotten Realms",
              // "CarPlay"). What cannot be prose is a name this repo actually
              // registers as a component.
              if (COMPONENT_NAMES.has(word)) {
                violations.push(`${file} renders "${word}" as text — missing angle brackets?`);
              }
            }
          }
          if ("children" in node && Array.isArray(node.children)) {
            walk(node.children as TemplateChildNode[]);
          }
        }
      };
      walk(descriptor.template.ast?.children ?? []);
    }

    expect(checked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  // The same accident one layer down: a component name left inside a *string*
  // rather than a text node. `ListSearchInput`'s default placeholder read
  // "IconSearch…" and `TagPickerInput`'s did too — a find/replace that turned
  // <IconSearch/> into text and then into a prop default. Latent in both cases
  // only because most call sites pass their own placeholder, and ListSearchInput
  // is the shared search field for 21 views.
  //
  // Scoped to the handful of props that reach a user's eyes. A component name in
  // any other string is usually a legitimate reference (an import path, a test
  // name, a comment), which is why this does not scan strings generally.
  it("no component name sits inside a user-facing string", () => {
    const USER_FACING = /(placeholder|label|title|aria-label|ariaLabel|tooltip)\s*[=:]\s*"([^"]{2,80})"/g;
    const violations: string[] = [];
    let checked = 0;

    for (const file of trackedFiles("src/**/*.vue", "src/**/*.ts")) {
      if (file === SELF || /icons\.ts$|\.test\.ts$|dev\/(ComponentCatalogueView|CatalogueSection)\.vue$/.test(file)) continue;
      const source = read(file);
      for (const [, prop, text] of source.matchAll(USER_FACING)) {
        checked++;
        for (const word of text.match(/\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/g) ?? []) {
          if (COMPONENT_NAMES.has(word)) {
            violations.push(`${file} shows "${word}" to the user via ${prop}`);
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});

describe("responsive type steps stay inside the type scale", () => {
  // `text-sm` is 0.875rem — byte-for-byte the size of the `text-body` role. So a
  // breakpoint step *to* `text-sm` lands whatever it is applied to on the reading
  // role, and if the thing being stepped was a micro-label, the portal's smallest
  // role and its body role render at the same size from 768px up.
  //
  // That is not hypothetical. `md:text-sm` reached 209 sites, all of them from one
  // mechanical pass (39b4bbf4, "#339 responsive typography pass") that appended it
  // to every hardcoded pixel size it swept, with no per-site judgement. Measured in
  // the browser, PlayerCharacterHeader's combat row came out:
  //
  //     390px   AC 10px · 16 12px bold · ft 10px    label under value — correct
  //     1280px  AC 14px · 16 12px bold · ft 14px    label OVER value — inverted
  //
  // The other 25 were `class="md:text-sm"` on an `AppButton size="xs"`, i.e. a call
  // site overriding the primitive's own font size at a breakpoint and leaving its
  // padding and height behind — 14px text in an xs box.
  //
  // If you want a responsive step, step between *roles* (`text-caption md:text-body`)
  // so the result still names something. `@utility` roles take variants fine.
  it("nothing steps up to text-sm at a breakpoint", () => {
    const offenders: string[] = [];

    for (const file of trackedFiles("src/**/*.vue", "src/**/*.ts")) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          if (/\b(sm|md|lg|xl|2xl):text-sm\b/.test(line)) {
            offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
          }
        });
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
