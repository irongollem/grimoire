/// <reference types="node" />
// Runs in Node and reads the repo from disk; see the same note in
// crossArtifactInvariants.test.ts for why it pulls the node types in itself.

/**
 * House style: no em-dashes in anything a user reads (#968). The maintainer
 * reads them as the tell of AI-written copy, and a sweep in October 2026 found
 * them in empty states and helper text across about 300 components, one
 * plausible-looking line at a time. So the rule is asserted rather than
 * re-made in every review.
 *
 * Scope is the template, parsed: text nodes, static attribute values, and string
 * literals inside bindings and interpolations. Comments are never scanned. A
 * string that is exactly one em-dash is allowed, because that is an empty-value
 * glyph in a table cell (`initiative ?? "—"`), not prose.
 *
 * Copy that lives in a script block or a .ts module (toasts, seed data) is not
 * covered: telling a user-facing literal from a prompt, a log line or a parser
 * pattern needs judgement this scan cannot make.
 */

import { describe, it, expect } from "vitest";
import { parse } from "@vue/compiler-sfc";
import { NodeTypes, type TemplateChildNode } from "@vue/compiler-core";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = process.cwd();
const EM_DASH = "—";

/** Dev-only surfaces, stripped from production builds, so no user reads them. */
const DEV_ONLY = /^src\/views\/dev\//;

function trackedVueFiles(): string[] {
  return execFileSync("git", ["ls-files", "src/**/*.vue"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !DEV_ONLY.test(f))
    .filter((f) => existsSync(path.join(REPO_ROOT, f)));
}

/** String literals in a JS expression that carry an em-dash as prose. */
function dashedLiterals(expression: string): string[] {
  const literals = [...expression.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
  return literals.filter((s) => s.includes(EM_DASH) && s.trim() !== EM_DASH);
}

function isProse(text: string): boolean {
  return text.includes(EM_DASH) && text.trim() !== EM_DASH;
}

describe("user-facing copy", () => {
  it("has no em-dash in any template", { timeout: 20_000 }, () => {
    const violations: string[] = [];
    let checked = 0;

    for (const file of trackedVueFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      if (!source.includes(EM_DASH)) continue;
      const { descriptor } = parse(source, { filename: file });
      if (!descriptor.template) continue;
      checked++;

      const flag = (line: number, text: string) =>
        violations.push(`${file}:${line}  ${text.trim().slice(0, 80)}`);

      const walk = (nodes: TemplateChildNode[]): void => {
        for (const node of nodes) {
          if (node.type === NodeTypes.TEXT && isProse(node.content)) {
            flag(node.loc.start.line, node.content);
          }
          if (node.type === NodeTypes.INTERPOLATION && node.content.type === NodeTypes.SIMPLE_EXPRESSION) {
            for (const s of dashedLiterals(node.content.content)) flag(node.loc.start.line, s);
          }
          if (node.type === NodeTypes.ELEMENT) {
            for (const prop of node.props) {
              if (prop.type === NodeTypes.ATTRIBUTE && prop.value && isProse(prop.value.content)) {
                flag(prop.loc.start.line, `${prop.name}="${prop.value.content}"`);
              }
              if (prop.type === NodeTypes.DIRECTIVE && prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION) {
                for (const s of dashedLiterals(prop.exp.content)) flag(prop.loc.start.line, s);
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
});

/**
 * Cinzel at a heading size is a role, never a hand-rolled class pair (#967).
 *
 * The #552 heading tiers (`text-heading-sm` … `text-display`, defined in
 * typography.css) already carry the font, and deliberately no tracking. A
 * conventions review in October 2026 caught new headings copying
 * `font-cinzel text-sm font-semibold tracking-wide` from a neighbour, and a
 * count found 440 such pairs across the app. Weight and colour still vary per
 * site and stay separate classes; only the font plus size is the role's.
 *
 * The 2xs/xs sizes are the label family (`text-eyebrow`, `text-label`,
 * `text-label-lg`), which bundles tracking, so a plain `font-cinzel text-xs` is
 * not a 1:1 match for any of them and is not policed here.
 */
const HEADING_SIZE = /^text-(sm|base|lg|xl|2xl|3xl)$/;

/**
 * The control primitives' own size recipes. Their `lg` step sets Cinzel on a
 * button or field label, which is a control, not a heading, and the recipe lives
 * exactly once, in the variant table, which is what a role would buy anyway.
 */
const CONTROL_RECIPES = new Set([
  "src/components/common/appButtonVariants.ts",
  "src/components/common/fieldVariants.ts",
]);

function trackedSources(): string[] {
  return execFileSync("git", ["ls-files", "src/**/*.vue", "src/**/*.ts"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.ts") && !CONTROL_RECIPES.has(f))
    .filter((f) => existsSync(path.join(REPO_ROOT, f)));
}

describe("Cinzel headings", () => {
  it("use a heading role rather than font-cinzel plus a size", () => {
    const violations: string[] = [];

    for (const file of trackedSources()) {
      // Comments may quote the old recipe to explain the role (ModalHeader does);
      // blank them, keeping their newlines so reported line numbers stay true.
      const blank = (m: string) => m.replace(/[^\n]/g, " ");
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(/<!--[\s\S]*?-->/g, blank)
        .replace(/(^|\s)\/\/.*$/gm, blank);
      source.split("\n").forEach((line, i) => {
        // A class list is one quoted string or one `@apply` line; checking each
        // separately keeps two unrelated strings on one line from pairing up.
        const lists = [...line.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
        const apply = line.match(/@apply\s+([^;]*)/);
        if (apply) lists.push(apply[1]);
        for (const list of lists) {
          const tokens = list.split(/\s+/);
          if (tokens.includes("font-cinzel") && tokens.some((t) => HEADING_SIZE.test(t))) {
            violations.push(`${file}:${i + 1}  ${list.trim().slice(0, 80)}`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
