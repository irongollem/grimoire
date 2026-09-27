// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { entityArtFiguresHtml, applyArtChoice, ENTITY_ART_CHOICES } from "./entityArt";

describe("entityArtFiguresHtml", () => {
  it("renders both figures, tagged by kind, when both images exist", () => {
    const html = entityArtFiguresHtml({ picture: "pic.webp", cutout: "cut.webp", alt: "Owlbear" });
    expect(html).toContain('data-art-kind="picture"');
    expect(html).toContain('data-art-kind="cutout"');
    expect(html).toContain("sc-entity-art--picture");
    expect(html).toContain("sc-entity-art--cutout");
    expect(html).toContain('src="pic.webp"');
    expect(html).toContain('src="cut.webp"');
  });

  it("renders only the picture figure when there is no cutout", () => {
    const html = entityArtFiguresHtml({ picture: "pic.webp", cutout: null, alt: "Owlbear" });
    expect(html).toContain('data-art-kind="picture"');
    expect(html).not.toContain("data-art-kind=\"cutout\"");
  });

  it("renders only the cutout figure when there is no picture", () => {
    const html = entityArtFiguresHtml({ picture: null, cutout: "cut.webp", alt: "Owlbear" });
    expect(html).toContain('data-art-kind="cutout"');
    expect(html).not.toContain('data-art-kind="picture"');
  });

  it("returns an empty string when neither image exists", () => {
    expect(entityArtFiguresHtml({ picture: null, cutout: null, alt: "Owlbear" })).toBe("");
  });

  it("escapes the alt text", () => {
    const html = entityArtFiguresHtml({ picture: "pic.webp", cutout: null, alt: "Tom & <the cat>" });
    expect(html).toContain("Tom &amp; &lt;the cat&gt;");
    expect(html).not.toContain("<the cat>");
  });
});

function container(html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("applyArtChoice", () => {
  const both =
    '<div class="aside">' +
    '<img data-art-kind="picture" src="pic.webp" />' +
    '<img data-art-kind="cutout" src="cut.webp" />' +
    "</div>";

  it("auto prefers the cutout when both exist", () => {
    const root = container(both);
    applyArtChoice(root, "auto");
    const kinds = Array.from(root.querySelectorAll("[data-art-kind]")).map((el) => el.getAttribute("data-art-kind"));
    expect(kinds).toEqual(["cutout"]);
  });

  it("cutout choice keeps the cutout when both exist", () => {
    const root = container(both);
    applyArtChoice(root, "cutout");
    expect(root.querySelectorAll('[data-art-kind="cutout"]').length).toBe(1);
    expect(root.querySelectorAll('[data-art-kind="picture"]').length).toBe(0);
  });

  it("picture choice keeps the picture when both exist", () => {
    const root = container(both);
    applyArtChoice(root, "picture");
    expect(root.querySelectorAll('[data-art-kind="picture"]').length).toBe(1);
    expect(root.querySelectorAll('[data-art-kind="cutout"]').length).toBe(0);
  });

  it("falls back to the picture when cutout is forced but only a picture exists", () => {
    const root = container('<div class="aside"><img data-art-kind="picture" src="pic.webp" /></div>');
    applyArtChoice(root, "cutout");
    expect(root.querySelectorAll('[data-art-kind="picture"]').length).toBe(1);
  });

  it("falls back to the cutout when picture is forced but only a cutout exists", () => {
    const root = container('<div class="aside"><img data-art-kind="cutout" src="cut.webp" /></div>');
    applyArtChoice(root, "picture");
    expect(root.querySelectorAll('[data-art-kind="cutout"]').length).toBe(1);
  });

  it("is a no-op when there is no art at all", () => {
    const root = container('<div class="aside"></div>');
    expect(() => applyArtChoice(root, "auto")).not.toThrow();
    expect(root.querySelectorAll("[data-art-kind]").length).toBe(0);
  });

  it("handles multiple independent parents (multiple embeds of the same entity)", () => {
    const root = container(both + both);
    applyArtChoice(root, "picture");
    const kinds = Array.from(root.querySelectorAll("[data-art-kind]")).map((el) => el.getAttribute("data-art-kind"));
    expect(kinds).toEqual(["picture", "picture"]);
  });
});

describe("ENTITY_ART_CHOICES", () => {
  it("lists all three choices", () => {
    expect(ENTITY_ART_CHOICES).toEqual(["auto", "cutout", "picture"]);
  });
});
