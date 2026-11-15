/**
 * The combat rules also run on the server (issue #1201), inside a Supabase
 * edge function. Deno resolves neither the `@/` alias nor extensionless
 * paths, so every import that survives to run time in these files must be a
 * relative path ending in `.ts`. A value import through the alias would only
 * fail at deploy, where nothing in the gate would catch it.
 *
 * Type-only imports are erased before run time and may stay on `@/`.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const ENTRY_POINTS = [
  "src/rules/encounterTurn.ts",
  "src/rules/combat/resolveAction.ts",
  "src/rules/conditionDurations.ts",
  "src/rules/encounterCombatLogic.ts",
  "src/rules/fight/fightCommands.ts",
  "src/rules/fight/fightEvents.ts",
  "src/rules/fight/fightSpawn.ts",
  "src/rules/fight/fightState.ts",
  "src/rules/fight/partyIngest.ts",
  "src/rules/fight/fightEnd.ts",
  "src/lib/dice/diceRules.ts",
  "src/systems/dnd5e/dice/rules.ts",
];
const FORBIDDEN_PACKAGES = ["vue", "pinia"];

interface RuntimeImport {
  specifier: string;
  line: number;
}

function runtimeImports(file: string, source: ts.SourceFile): RuntimeImport[] {
  const found: RuntimeImport[] = [];
  const add = (literal: ts.StringLiteralLike) => {
    const line = source.getLineAndCharacterOfPosition(literal.getStart()).line + 1;
    found.push({ specifier: literal.text, line });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined &&
            named !== undefined &&
            ts.isNamedImports(named) &&
            named.elements.length > 0 &&
            named.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly) add(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      add(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  void file;
  return found;
}

function mentionsImportMeta(source: ts.SourceFile): number | null {
  let line: number | null = null;
  const visit = (node: ts.Node) => {
    if (
      line === null &&
      ts.isMetaProperty(node) &&
      node.keywordToken === ts.SyntaxKind.ImportKeyword
    ) {
      line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return line;
}

function scan(): { files: string[]; problems: string[] } {
  const seen = new Set<string>();
  const problems: string[] = [];
  const queue = ENTRY_POINTS.map((entry) => join(ROOT, entry));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const name = relative(ROOT, file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const metaLine = mentionsImportMeta(source);
    if (metaLine !== null) problems.push(`${name}:${metaLine} uses import.meta`);
    for (const { specifier, line } of runtimeImports(file, source)) {
      const where = `${name}:${line}`;
      if (FORBIDDEN_PACKAGES.includes(specifier.split("/")[0] ?? "")) {
        problems.push(`${where} imports "${specifier}"`);
      } else if (!specifier.startsWith(".")) {
        problems.push(`${where} run-time import "${specifier}" is not a relative path`);
      } else if (!specifier.endsWith(".ts")) {
        problems.push(`${where} run-time import "${specifier}" has no .ts extension`);
      } else {
        queue.push(resolve(dirname(file), specifier));
      }
    }
  }
  return { files: [...seen].map((f) => relative(ROOT, f)).sort(), problems };
}

describe("combat rules stay loadable by edge functions", () => {
  it("fails when a run-time import goes through the @/ alias, lacks .ts, or pulls in the browser", () => {
    const { files, problems } = scan();
    expect(files.length).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  });
});
