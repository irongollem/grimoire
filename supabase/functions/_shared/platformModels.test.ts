import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { isFlexibleOpenAiModel } from "./platformModels.ts";

describe("isFlexibleOpenAiModel", () => {
  it("treats the gpt-image-2.5 and 2.6 families as flexible", () => {
    expect(isFlexibleOpenAiModel("gpt-image-2.6-flare")).toBe(true);
    expect(isFlexibleOpenAiModel("gpt-image-2.6-sunburst")).toBe(true);
    expect(isFlexibleOpenAiModel("gpt-image-2.5-flare")).toBe(true);
    expect(isFlexibleOpenAiModel("gpt-image-2.5")).toBe(true);
  });

  it("treats every other OpenAI model as fixed-size, including gpt-image-2's own name", () => {
    expect(isFlexibleOpenAiModel("gpt-image-2")).toBe(false);
    expect(isFlexibleOpenAiModel("gpt-image-1")).toBe(false);
    expect(isFlexibleOpenAiModel("gpt-image-1.5")).toBe(false);
    expect(isFlexibleOpenAiModel("gpt-image-3")).toBe(false);
  });
});

/**
 * A model id written in code outside platformModels.ts is one the next upgrade
 * has to find by hand. Before 16 Nov 2026 the OpenAI ids sat in a dozen files
 * and moving to new models took a search across all of them; this holds every id
 * to the one module. Comments may name models (history, examples); code may not.
 */
const ROOT = resolve(process.cwd());
const SCANNED = ["src", "scripts", "supabase/functions", "api", "infra"];
const MODEL_ID = /\b(?:gpt-(?:image-)?\d[\w.-]*|claude-(?:opus|sonnet|haiku)-[\w.-]+|gemini-[\d.]+-[\w.-]+|gemini-embedding-[\w.-]+|lyria-[\d.]+[\w.-]*|text-embedding-[\w.-]+)/g;

// Files allowed to name a model, and why. Everything else imports platformModels.ts.
const ALLOWED = new Map([
  ["supabase/functions/_shared/platformModels.ts", "the one home of every model id"],
  ["scripts/lib/bookImages.ts", "history: the ChatGPT image release each pipeline picture was painted on"],
  ["scripts/seed-library-tile-packs.ts", "history: the model a seeded tile pack was actually made with"],
]);

function codeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : codeFiles(path);
    if (!/\.(?:ts|mts|vue)$/.test(entry.name) || /\.(?:test|spec)\.ts$/.test(entry.name) || entry.name.endsWith(".d.ts")) return [];
    return [path];
  });
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

describe("model ids live in platformModels.ts", () => {
  it("names no model id in code anywhere else", () => {
    const strays: string[] = [];
    for (const dir of SCANNED) {
      for (const file of codeFiles(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (ALLOWED.has(rel)) continue;
        for (const match of withoutComments(readFileSync(file, "utf8")).matchAll(MODEL_ID)) strays.push(`${rel}: ${match[0]}`);
      }
    }
    expect(strays).toEqual([]);
  });

  it("still finds an id when one is written outside the module", () => {
    // Guards the scan: a pattern that matched nothing would pass the test above against any code.
    const sample = 'const fallback = "gpt-image-2.6-flare"; // a stray\nconst other = "claude-haiku-4-5";';
    expect([...withoutComments(sample).matchAll(MODEL_ID)].map((m) => m[0])).toEqual(["gpt-image-2.6-flare", "claude-haiku-4-5"]);
  });
});
