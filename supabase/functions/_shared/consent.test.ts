import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { renewalDisclosure, TERMS_VERSION } from "./consent";

describe("renewalDisclosure", () => {
  it("names the period, the price, and how to stop it", () => {
    const text = renewalDisclosure("month", "€8");
    expect(text).toContain("renews automatically every month at €8");
    expect(text).toContain("until you cancel");
    expect(text).toContain("cancel anytime");
  });

  it("says year for the annual plan and omits the price when Stripe prints it", () => {
    const text = renewalDisclosure("year");
    expect(text).toContain("every year until you cancel");
    expect(text).not.toContain(" at ");
  });

  // The disclosure must sit above Stripe's Subscribe button, not only the app's.
  it("is passed to the subscription checkout as the submit-button text", () => {
    const src = readFileSync(join(__dirname, "..", "stripe-create-checkout", "index.ts"), "utf8");
    expect(src).toMatch(/submit:\s*\{\s*message:\s*renewalDisclosure\(interval\)/);
  });
});

describe("TERMS_VERSION", () => {
  // accept_terms refuses any version but private.current_terms_version(), so a
  // bump that forgets the migration would leave every user unable to accept.
  it("matches the newest private.current_terms_version() in the migrations", () => {
    const dir = join(__dirname, "..", "..", "migrations");
    const definitions = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .flatMap((sql) => [...sql.matchAll(/function private\.current_terms_version\(\)[\s\S]*?select '([^']+)'::text/g)].map((m) => m[1]));
    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions[definitions.length - 1]).toBe(TERMS_VERSION);
  });
});

