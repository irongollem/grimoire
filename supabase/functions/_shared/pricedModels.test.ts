import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A model id written into an edge function is a model the platform pays for,
 * and `ai_generation_costs` can only price it if `ai_model_pricing` has its row.
 * supabase/tests/model_pricing_coverage.test.sql checks the rows exist for a
 * list of models; this file holds that list equal to the ids actually named
 * here, so a new constant cannot ship unpriced the way the map styler's
 * gpt-image-2.5-sunburst did (#962).
 */
const FUNCTIONS_DIR = resolve(process.cwd(), "supabase/functions");
const COVERAGE_TEST = resolve(process.cwd(), "supabase/tests/model_pricing_coverage.test.sql");

const MODEL_LITERAL = /"((?:gpt|gemini|claude|lyria|text-embedding)-[a-z0-9.-]+)"/g;

// Literals with a model's shape that do not name one model: family prefixes
// tested with startsWith / === to pick request parameters.
const NOT_A_MODEL = new Map([
  ["gpt-5.6", "isOpenAi56Model: family match for reasoning_effort"],
  ["gpt-5.6-", "isOpenAi56Model: family prefix"],
  ["gpt-image-2.5", "isFlexibleOpenAiModel: family prefix for output sizes"],
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

// Comments name models as examples ("e.g. \"gpt-image-1\""); only code counts.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

function namedModels(): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(FUNCTIONS_DIR)) {
    for (const match of stripComments(readFileSync(file, "utf8")).matchAll(MODEL_LITERAL)) {
      if (!NOT_A_MODEL.has(match[1])) found.add(match[1]);
    }
  }
  return [...found].sort();
}

function coverageList(): string[] {
  const sql = readFileSync(COVERAGE_TEST, "utf8");
  const block = /insert into edge_function_models \(model\) values([\s\S]*?);/.exec(sql);
  if (!block) throw new Error("could not find the edge_function_models list in model_pricing_coverage.test.sql");
  return [...block[1].matchAll(/\('([^']+)'\)/g)].map((m) => m[1]).sort();
}

describe("edge function model pricing", () => {
  it("checks every model the edge functions name against ai_model_pricing", () => {
    expect(coverageList()).toEqual(namedModels());
  });

  it("still finds the models it is meant to find", () => {
    // Guards the scan itself: a regex that silently matched nothing would make
    // the comparison above pass against an emptied list.
    expect(namedModels()).toContain("gpt-image-2.5-flare");
  });
});
