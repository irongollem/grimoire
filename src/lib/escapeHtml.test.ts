// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { escapeHtml } from "./escapeHtml";

describe("escapeHtml", () => {
  it("escapes markup and both quote kinds", () => {
    expect(escapeHtml(`<b>"Rosie" & Tippet's</b>`)).toBe("&lt;b&gt;&quot;Rosie&quot; &amp; Tippet&#39;s&lt;/b&gt;");
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("Marzipan Sentry")).toBe("Marzipan Sentry");
  });

  it("keeps a quoted name inside its attribute", () => {
    const el = document.createElement("div");
    el.innerHTML = `<img alt="${escapeHtml('Rosetta "Rosie" Vermeil')}">`;
    expect(el.querySelector("img")?.getAttribute("alt")).toBe('Rosetta "Rosie" Vermeil');
  });
});
