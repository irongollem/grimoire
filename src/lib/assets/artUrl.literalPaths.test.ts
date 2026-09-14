import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import artManifestJson from "@/generated/artManifest.json";

/**
 * Guardrail for #877: every path `src/generated/artManifest.json` names must
 * reach the bundle through `artUrl()` (./artUrl.ts).
 *
 * `artStripPlugin` (vite.config.ts) deletes every manifest key's served path
 * out of `dist/` once a CDN base is configured — which is always true in
 * production. A literal `/assets/...` string that happens to equal a
 * manifest key is a 404 waiting for the next deploy; four icon components, a
 * puzzle data file and three more call sites shipped exactly that bug before
 * this test existed (#877). This test scans the source tree for a manifest
 * key appearing as a bare string literal and fails unless the same line also
 * calls `artUrl(`.
 *
 * Excluded from the scan, each for a reason rather than convenience:
 *   - `src/generated/` — the manifest itself and its siblings; not app code.
 *   - `*.test.*` / `*.spec.*` — test fixtures may legitimately assert against
 *     a raw manifest key without resolving it.
 *   - binary/font/media extensions — never contain source text, and reading
 *     ~90MB of art as UTF-8 to grep it would make this test slow for zero
 *     benefit; the scan only opens file types that can plausibly contain a
 *     `/assets/...` string literal in the first place.
 *   - full-line comments (a trimmed line starting with `//`, `/*` or `*`) —
 *     documenting a path (a docstring example, "source art lives at…") is
 *     not a call site. A key mentioned on a line that also has real code
 *     still fails, because the code portion is what matters.
 */

const SRC_ROOT = join(import.meta.dirname, "../.."); // src/lib/assets -> src

/** Extensions that can plausibly hold a `/assets/...` string literal. */
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".vue", ".js", ".jsx", ".mjs", ".css", ".json"]);

function isFullLineComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (/\.(test|spec)\./.test(entry.name)) continue;
    if (!SCANNED_EXTENSIONS.has(extname(entry.name))) continue;
    out.push(full);
  }
  return out;
}

describe("every art-manifest key reaches the bundle through artUrl()", () => {
  const manifest: Record<string, string> = artManifestJson;
  const keys = Object.keys(manifest);

  it("has manifest keys to check (sanity — an empty manifest would make the real test vacuous)", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it("never appears as a bare literal outside artUrl()", () => {
    const files = collectFiles(SRC_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      const relPath = relative(SRC_ROOT, file);

      lines.forEach((line, i) => {
        if (line.includes("artUrl(") || isFullLineComment(line)) return;
        for (const key of keys) {
          if (line.includes(key)) {
            offenders.push(`src/${relPath}:${i + 1} — "${key}" not wrapped in artUrl()`);
          }
        }
      });
    }

    expect(offenders, `\n${offenders.join("\n")}`).toEqual([]);
  });
});
