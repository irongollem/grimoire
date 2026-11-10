// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyClamps, CLAMP_ATTR, longestFit, truncateText } from "@/lib/cardforge/lineClamp";

function box(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("truncateText", () => {
  it("cuts inside the node that holds the cut, not at a node boundary", () => {
    // "Bite. " is 6 characters; keeping 9 cuts 3 into the second text node.
    const el = box(`<b>Bite. </b>Melee weapon attack`);
    truncateText(el, 9);
    expect(el.textContent).toBe("Bite. Mel…");
  });

  it("drops what follows the cut, damage icons included", () => {
    // A FitText entry: a clamped line with a damage icon after the cut must not
    // print the icon after the "…".
    const el = box(`2d6 slashing <span class="icon"></span> damage`);
    truncateText(el, 3);
    expect(el.innerHTML).toBe("2d6…");
  });

  it("cleans the end of a bold name when the cut falls exactly where it ends", () => {
    // "Bite, " is 6 characters: the cut is at the end of the first text node, which
    // must be the one that ends in "…", or its ", " is left dangling.
    const el = box(`<b>Bite, </b>Melee weapon attack`);
    truncateText(el, 6);
    expect(el.textContent).toBe("Bite…");
  });

  it("does not leave a comma or space dangling before the …", () => {
    const el = box(`"Small iridescent birds, starling-sized"`);
    truncateText(el, 25); // ends on "birds, "
    expect(el.textContent).toBe(`"Small iridescent birds…`);
  });
});

describe("longestFit", () => {
  it("finds the last length that fits, not the first that does not", () => {
    // Up to 41 characters fit.
    expect(longestFit(100, (n) => n <= 41)).toBe(41);
  });

  it("returns zero when even one character does not fit", () => {
    expect(longestFit(100, (n) => n === 0)).toBe(0);
  });
});

describe("applyClamps", () => {
  it("cuts only the tagged copy, by the length measured for its own tag", () => {
    // Two clamped boxes on one card (the last ability and the flavor) each get
    // their own measurement; swapping them would cut the wrong text.
    const card = box(`<p ${CLAMP_ATTR}="0">Ledger Memory remembers</p><p ${CLAMP_ATTR}="1">Small birds</p><p>Untouched text</p>`);
    applyClamps(card, new Map([["0", 6], ["1", 3]]));
    expect(Array.from(card.querySelectorAll("p")).map((p) => p.textContent)).toEqual(["Ledger…", "Sma…", "Untouched text"]);
    expect(card.querySelector(`[${CLAMP_ATTR}]`)).toBeNull();
  });
});
