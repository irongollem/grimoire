// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { preparePagedBody } from "./pagedPrepare";

const opts = { showPageNumbers: true, pageSize: "A4" as const, isTwoColumn: false };

describe("preparePagedBody", () => {
  it("wraps the body in the two-column flow only when asked", () => {
    expect(preparePagedBody("<p>Hi</p>", { ...opts, isTwoColumn: true })).toBe('<div class="phb-two-col"><p>Hi</p></div>');
    expect(preparePagedBody("<p>Hi</p>", opts)).toBe("<p>Hi</p>");
  });

  it("runs every pre-layout step: long boxes, table headers and wrapped-image groups", () => {
    const html =
      `<div class="sc-note"><p>${"x".repeat(900)}</p></div>` +
      "<table><tbody><tr><th>Item</th><th>Value</th></tr><tr><td>Swan</td><td>Keepsake</td></tr></tbody></table>" +
      '<h2>Rosie</h2><div class="sc-img-wrap sc-img-wrap--wrapLeft"><img src="r.webp"></div><p>Fighter.</p>';
    const out = document.createElement("div");
    out.innerHTML = preparePagedBody(html, opts);
    expect(out.querySelector(".sc-note")?.classList.contains("sc-box--long")).toBe(true);
    expect(out.querySelector("thead th")?.textContent).toBe("Item");
    expect(out.querySelector(".sc-float-group h2")?.textContent).toBe("Rosie");
  });
});
