import { describe, expect, it } from "vitest";
import { escapeHtml } from "./emailHtml";

describe("escapeHtml", () => {
  it("escapes the five characters that can open a tag or close an attribute", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes an ampersand once, so text that already looks like an entity stays literal", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("Plain text 123")).toBe("Plain text 123");
  });
});
