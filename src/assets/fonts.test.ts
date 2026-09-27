import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Fonts are self-hosted (see fonts.ts). A single `@import` or `<link>` to
// Google Fonts puts every visitor's IP back on Google's servers, and nothing
// else in the build would notice — so the whole shipped surface is scanned.
const ROOT = join(__dirname, "..", "..");
const SCANNED = ["src", "public", "index.html"];
const GOOGLE_FONTS = /\/\/fonts\.(googleapis|gstatic)\.com/;

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

describe("web fonts", () => {
  it("are never loaded from Google", () => {
    const offenders = SCANNED.flatMap((p) => files(join(ROOT, p)))
      .filter((f) => /\.(css|html|vue|ts|js|mjs)$/.test(f) && !f.endsWith("fonts.test.ts"))
      .filter((f) => GOOGLE_FONTS.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
