/**
 * Some of `src/` also runs on the server, inside Supabase edge functions: the combat rules (issue #1201), the dice
 * (#1204), the stat-block rules, the tile-pack plan. The edge runtime resolves neither the `@/` alias nor a path
 * without its extension, so every import in a file an edge function reaches must be a relative path ending in `.ts`.
 *
 * That holds for **type-only imports too**. They are erased before the code runs, and `deno run` accepts them, which
 * is why this test first let them stay on the alias. The edge runtime does not: it resolves types while it builds a
 * function's module graph, and `encounter-command` failed to boot on `import type { Monster } from "@/types/..."`
 * ("Failed resolving types", 15 Nov 2026) with lint, type-check, the unit suite and the build all green. Nothing else
 * in the gate loads an edge function, so this test is what stands between such an import and a function that is dead
 * on arrival.
 *
 * The entry points are not listed by hand: every non-test file under `supabase/functions/` is read, and whatever it
 * imports from `src/` is followed to the end.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src") + sep;
const FUNCTIONS = join(ROOT, "supabase/functions");
/** Modules written for the edge before any function loads them (#1202), held to the rule from the start. */
const PENDING_ENTRIES = [
  join(SRC, "rules/fight/pcAttacks/rows.ts"),
  join(SRC, "rules/fight/pcAttacks/entry.ts"),
  join(SRC, "rules/fight/allies/statBlock.ts"),
  join(SRC, "rules/fight/pcAttacks/gear.ts"),
  join(SRC, "rules/fight/allies/profile.ts"),
  join(SRC, "rules/fight/allies/features.ts"),
  join(SRC, "rules/spellcastingByClass.ts"),
  join(SRC, "rules/fight/terrain/reach.ts"),
  join(SRC, "rules/fight/terrain/sight.ts"),
  join(SRC, "rules/fight/terrain/battleMap.ts"),
  join(SRC, "rules/fight/terrain/movementBudget.ts"),
  join(SRC, "rules/fight/tactics/profile.ts"),
  join(SRC, "rules/fight/tactics/numbers.ts"),
  join(SRC, "rules/fight/tactics/pick.ts"),
  join(SRC, "rules/fight/tactics/carryOut.ts"),
  join(SRC, "lib/encounters/combatantSpeed.ts"),
];
const FORBIDDEN_PACKAGES = ["vue", "pinia"];

function edgeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return edgeFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

/** Every module specifier a file names: imports, re-exports and dynamic imports, type-only or not. */
function specifiers(source: ts.SourceFile): { specifier: string; line: number }[] {
  const found: { specifier: string; line: number }[] = [];
  const add = (literal: ts.StringLiteralLike) => {
    found.push({ specifier: literal.text, line: source.getLineAndCharacterOfPosition(literal.getStart()).line + 1 });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier);
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) add(node.arguments[0]);
    // `import("...").Type` written inline in a type position: resolved by the edge runtime like any other.
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) add(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function importMetaLine(source: ts.SourceFile): number | null {
  let line: number | null = null;
  const visit = (node: ts.Node) => {
    if (line === null && ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return line;
}

const parse = (file: string): ts.SourceFile => ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

/** The problems in `text` as if it were the file `name` under `src/`: what the scan reports for one file. */
function problemsIn(name: string, source: ts.SourceFile): { problems: string[]; next: string[] } {
  const problems: string[] = [];
  const next: string[] = [];
  const metaLine = importMetaLine(source);
  if (metaLine !== null) problems.push(`${name}:${metaLine} uses import.meta`);
  for (const { specifier, line } of specifiers(source)) {
    const where = `${name}:${line}`;
    if (FORBIDDEN_PACKAGES.includes(specifier.split("/")[0] ?? "")) problems.push(`${where} imports "${specifier}"`);
    else if (!specifier.startsWith(".")) problems.push(`${where} import "${specifier}" is not a relative path`);
    else if (!specifier.endsWith(".ts")) problems.push(`${where} import "${specifier}" has no .ts extension`);
    else next.push(specifier);
  }
  return { problems, next };
}

function scan(): { files: string[]; problems: string[] } {
  const seen = new Set<string>();
  const problems: string[] = [];
  const queue: string[] = [...PENDING_ENTRIES];
  // Where edge code steps into src/.
  for (const file of edgeFiles(FUNCTIONS)) {
    for (const { specifier } of specifiers(parse(file))) {
      if (!specifier.startsWith(".")) continue;
      const target = resolve(dirname(file), specifier);
      if (target.startsWith(SRC)) queue.push(target);
    }
  }
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const found = problemsIn(relative(ROOT, file), parse(file));
    problems.push(...found.problems);
    for (const specifier of found.next) {
      // A path back out of src/ (into the functions' own shared code) is the edge runtime's home ground: not followed.
      const target = resolve(dirname(file), specifier);
      if (target.startsWith(SRC)) queue.push(target);
    }
  }
  return { files: [...seen].map((f) => relative(ROOT, f)).sort(), problems };
}

const sample = (text: string) => problemsIn("src/x.ts", ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true)).problems;

describe("what an edge function may import from src/", () => {
  it("refuses a type-only import through the alias (the import that kept encounter-command from booting)", () => {
    expect(sample('import type { Monster } from "@/types/monster.types";')).toEqual([
      'src/x.ts:1 import "@/types/monster.types" is not a relative path',
    ]);
    expect(sample('import { reduce, type State } from "@/rules/encounterTurn";')).toHaveLength(1);
    expect(sample('export type { State } from "@/rules/encounterTurn";')).toHaveLength(1);
    expect(sample('const slots: import("@/types/party.types").SpellSlotEntry[] = [];')).toHaveLength(1);
  });

  it("refuses a relative import without its extension, and the browser's own modules", () => {
    expect(sample('import { a } from "./a";')).toEqual(['src/x.ts:1 import "./a" has no .ts extension']);
    expect(sample('import { ref } from "vue";')).toEqual(['src/x.ts:1 imports "vue"']);
    expect(sample("const dev = import.meta.env.DEV;")).toEqual(["src/x.ts:1 uses import.meta"]);
  });

  it("accepts a relative path with its extension, for values and for types", () => {
    expect(sample('import { a } from "./a.ts";\nimport type { B } from "../types/b.ts";')).toEqual([]);
  });
});

describe("everything the edge functions load from src/", () => {
  it("is reachable by the edge runtime: relative .ts imports only, no alias, no browser module", () => {
    const { files, problems } = scan();
    // The combat rules, the dice and their types alone are well over this: a scan that found almost nothing has
    // stopped following imports, and would pass whatever the files said.
    expect(files.length).toBeGreaterThan(80);
    expect(problems).toEqual([]);
  });
});
