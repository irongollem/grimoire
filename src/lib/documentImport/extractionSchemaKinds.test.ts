import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTRACTED_ROAD_GOINGS, EXTRACTED_ROAD_TERRAINS, IMPORT_CANON_PARTS, IMPORT_ENTITY_KINDS, IMPORT_PREMISE_KINDS } from "@/types/documentImport.types";
import { KNOWLEDGE_MARKS, LORE_KINDS } from "@/types/canon.types";

/**
 * The two edge functions are Deno and cannot import the client's kind list, so each holds a hand-copied mirror.
 * Reading the files keeps the copies from drifting: a kind missing from `ENTITY_KINDS` in import-extract is
 * dropped from every extraction without an error (this is how a new kind would silently never import), and one
 * missing from the schema is never asked of the model.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const listOf = (source: string, pattern: RegExp): string[] => {
  const match = pattern.exec(source);
  if (!match) throw new Error(`no match for ${pattern}`);
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
};

describe("the edge functions' copies of the import kinds", () => {
  it("import-extract keeps every kind the client imports", () => {
    expect(listOf(read("supabase/functions/import-extract/index.ts"), /const ENTITY_KINDS = \[([^\]]*)\]/).sort()).toEqual([...IMPORT_ENTITY_KINDS].sort());
  });

  it("the extraction schema asks the model for every kind", () => {
    const source = read("supabase/functions/import-extract/extractionSchema.ts");
    const block = /const EXTRACTION_SCHEMA = obj\(\{([\s\S]*?)\}\);/.exec(source)![1]!;
    expect([...block.matchAll(/^\s+(\w+): entityArray/gm)].map((m) => m[1]).sort()).toEqual([...IMPORT_ENTITY_KINDS].sort());
  });

  it("import-match accepts every kind", () => {
    const supported = listOf(read("supabase/functions/import-match/matching.ts"), /export const SUPPORTED_KINDS = \[([^\]]*)\]/);
    expect([...supported].sort()).toEqual([...IMPORT_ENTITY_KINDS].sort());
  });

  it("the canon enums in the schema are the ones the mapper reads, and never offer a line or a veil", () => {
    const source = read("supabase/functions/import-extract/extractionSchema.ts");
    const enumOf = (field: string) => listOf(source, new RegExp(`\\n  ${field}: \\{[^\\n]*enum: \\[([^\\]]*)\\]`));
    expect(enumOf("part")).toEqual([...IMPORT_CANON_PARTS]);
    expect(enumOf("premise_kind")).toEqual([...IMPORT_PREMISE_KINDS]);
    expect(enumOf("premise_kind")).not.toContain("line");
    expect(enumOf("knowledge")).toEqual([...KNOWLEDGE_MARKS]);
    expect(enumOf("lore_kind")).toEqual([...LORE_KINDS]);
  });

  it("the road going enum in the schema is the one the client cleans against", () => {
    const source = read("supabase/functions/import-extract/extractionSchema.ts");
    expect(listOf(source, /going: \{ type: "string", enum: \[([^\]]*)\]/)).toEqual([...EXTRACTED_ROAD_GOINGS]);
    expect(listOf(source, /terrain: \{ type: "string", enum: \[([^\]]*)\]/)).toEqual([...EXTRACTED_ROAD_TERRAINS]);
    expect(listOf(source, /unit: \{ type: "string", enum: \[([^\]]*)\]/)).toEqual(["mi", "km"]);
  });
});
