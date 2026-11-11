// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { FLOAT_GROUP_CHAR_THRESHOLD, groupWrappedImages } from "./pagedFloats";

const portrait = (side: "wrapLeft" | "wrapRight") =>
  `<div class="sc-img-wrap sc-img-wrap--${side}"><img src="rosie.webp" alt="Rosie"></div>`;

function parse(html: string): HTMLDivElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("groupWrappedImages", () => {
  it("returns the html unchanged when there is no wrapped image", () => {
    const html = '<p>No art.</p><div class="sc-img-wrap sc-img-wrap--inline"><img src="a.webp"></div>';
    expect(groupWrappedImages(html)).toBe(html);
  });

  it("groups a heading, its wrapped portrait and the paragraph beside it", () => {
    const out = parse(
      groupWrappedImages(`<h2>Rosie</h2>${portrait("wrapLeft")}<p>Fighter, level 6.</p><h2>Fresco</h2>`),
    );
    const group = out.querySelector(".sc-float-group");
    expect(group).not.toBeNull();
    expect([...group!.children].map((c) => c.tagName)).toEqual(["H2", "DIV", "P"]);
    expect(group!.querySelector("h2")?.textContent).toBe("Rosie");
    // The next entry's heading stays outside, after the group.
    expect(group!.nextElementSibling?.textContent).toBe("Fresco");
  });

  it("groups a right-wrapped image without a heading before it", () => {
    const out = parse(groupWrappedImages(`<p>Lead-in.</p>${portrait("wrapRight")}<p>Beside it.</p>`));
    const group = out.querySelector(".sc-float-group");
    expect([...group!.children].map((c) => c.tagName)).toEqual(["DIV", "P"]);
    expect(out.firstElementChild?.textContent).toBe("Lead-in.");
  });

  it("leaves a wrapped image alone when no paragraph follows it", () => {
    const html = `<h2>Gallery</h2>${portrait("wrapLeft")}<ul><li>a list</li></ul>`;
    expect(parse(groupWrappedImages(html)).querySelector(".sc-float-group")).toBeNull();
  });

  it("leaves a paragraph longer than a column's share ungrouped, so it may split", () => {
    const long = "x".repeat(FLOAT_GROUP_CHAR_THRESHOLD + 1);
    const short = "x".repeat(FLOAT_GROUP_CHAR_THRESHOLD);
    expect(parse(groupWrappedImages(`${portrait("wrapLeft")}<p>${long}</p>`)).querySelector(".sc-float-group")).toBeNull();
    expect(parse(groupWrappedImages(`${portrait("wrapLeft")}<p>${short}</p>`)).querySelector(".sc-float-group")).not.toBeNull();
  });

  it("groups every portrait in a run of entries separately", () => {
    const html = ["Toddy", "Chicory", "Rosie"].map((n) => `<h2>${n}</h2>${portrait("wrapLeft")}<p>${n} text.</p>`).join("");
    const groups = parse(groupWrappedImages(html)).querySelectorAll(".sc-float-group");
    expect([...groups].map((g) => g.querySelector("h2")?.textContent)).toEqual(["Toddy", "Chicory", "Rosie"]);
  });
});
