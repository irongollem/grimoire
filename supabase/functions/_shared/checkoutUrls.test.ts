import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkoutReturnUrls,
  safeReturnPath,
  termsAcceptanceMessage,
  withQueryFlag,
} from "./checkoutUrls";

describe("safeReturnPath", () => {
  it("keeps an app path and its query", () => {
    expect(safeReturnPath("/npcs")).toBe("/npcs");
    expect(safeReturnPath("/dungeon-craft?tab=traps")).toBe("/dungeon-craft?tab=traps");
  });

  it.each([
    ["an absolute URL", "https://evil.test/x"],
    ["a protocol-relative URL", "//evil.test/x"],
    ["a backslash host trick", "/\\evil.test"],
    ["a relative path", "npcs"],
    ["an empty string", ""],
    ["a non-string", 42],
    ["a javascript: URL", "javascript:alert(1)"],
  ])("refuses %s", (_label, value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it("refuses an overlong path", () => {
    expect(safeReturnPath(`/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("withQueryFlag", () => {
  it("adds the flag and keeps the existing query", () => {
    expect(withQueryFlag("/dungeon-craft?tab=traps", "credit_purchase", "success"))
      .toBe("/dungeon-craft?tab=traps&credit_purchase=success");
  });
});

describe("checkoutReturnUrls", () => {
  const flag = { key: "credit_purchase", value: "success" };

  it("returns the buyer to the page they were blocked on", () => {
    expect(checkoutReturnUrls("https://app.test", "/npcs", flag)).toEqual({
      success_url: "https://app.test/npcs?credit_purchase=success",
      cancel_url: "https://app.test/npcs",
    });
  });

  it("falls back to Billing when no safe path is given", () => {
    expect(checkoutReturnUrls("https://app.test", "//evil.test", flag)).toEqual({
      success_url: "https://app.test/billing?credit_purchase=success",
      cancel_url: "https://app.test/billing",
    });
  });
});

describe("termsAcceptanceMessage", () => {
  it("links the marketing site's legal pages", () => {
    expect(termsAcceptanceMessage("https://site.test/")).toBe(
      "I agree to the [Terms of Service](https://site.test/terms) and [Refund Policy](https://site.test/refunds).",
    );
  });
});

// Both checkouts must build their URLs through this module — a hand-written
// `${appUrl}/terms` or `/pricing` is exactly the drift it exists to prevent.
describe("the checkout functions use it", () => {
  it.each(["stripe-create-checkout", "stripe-create-credit-checkout"])("%s", (fn) => {
    const src = readFileSync(join(__dirname, "..", fn, "index.ts"), "utf8");
    expect(src).toContain("checkoutReturnUrls(");
    expect(src).toContain("termsAcceptanceMessage(");
    expect(src).not.toMatch(/\$\{appUrl\}\/(terms|refunds|pricing|billing)/);
  });
});
