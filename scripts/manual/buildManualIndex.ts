// `npm run manual:index`: regenerates supabase/functions/_shared/manual/manualPages.generated.ts from src/manual/*.md.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildManualIndex, renderManualModule } from "../../supabase/functions/_shared/manual/buildIndex.ts";

const root = join(import.meta.dirname, "..", "..");
const manualDir = join(root, "src", "manual");
const out = join(root, "supabase", "functions", "_shared", "manual", "manualPages.generated.ts");

const files = readdirSync(manualDir)
  .filter((name) => name.endsWith(".md"))
  .map((name) => ({ name, raw: readFileSync(join(manualDir, name), "utf8") }));
const pages = buildManualIndex(files);
const text = renderManualModule(pages);
writeFileSync(out, text);
console.log(`manual:index wrote ${pages.length} pages, ${(text.length / 1024).toFixed(0)} KB, to ${out}`);
