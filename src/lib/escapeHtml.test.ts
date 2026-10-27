import { describe, it, expect } from "vitest";
import { escapeHtml } from "./escapeHtml";

describe("escapeHtml", () => {
  it("escapes markup and both quote kinds", () => {
    expect(escapeHtml(`<b>"Rosie" & Tippet's</b>`)).toBe("&lt;b&gt;&quot;Rosie&quot; &amp; Tippet&#39;s&lt;/b&gt;");
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("Marzipan Sentry")).toBe("Marzipan Sentry");
  });

});
