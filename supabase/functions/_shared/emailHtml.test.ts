import { describe, expect, it } from "vitest";
import { escapeHtml } from "./emailHtml";

describe("escapeHtml", () => {
  it("escapes all five characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes ampersands first so entities are not double-escaped", () => {
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("Plain text 123")).toBe("Plain text 123");
  });
});
