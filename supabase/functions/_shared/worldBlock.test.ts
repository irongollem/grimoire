import { describe, expect, it } from "vitest";
import {
  worldBlockFromRows,
  worldBlockText,
  worldImageSetting,
  type CanonRowForBlock,
} from "./worldBlock";

let order = 0;
const row = (over: Partial<CanonRowForBlock>): CanonRowForBlock => ({
  part: "premise",
  premise_kind: null,
  knowledge: null,
  title: "",
  body: null,
  sort_order: order++,
  ...over,
});
const premise = (premise_kind: string, title: string, body: string | null = null) =>
  row({ part: "premise", premise_kind, title, body });
const truth = (knowledge: string, title: string) => row({ part: "truth", knowledge, title });

describe("worldBlockFromRows", () => {
  it("never lets a secret or a some-know truth reach a generator", () => {
    const block = worldBlockFromRows("Sothery", [
      truth("all", "The sun is a door"),
      truth("some", "The abbot is a lich"),
      truth("secret", "The king is dead"),
    ]);
    expect(block.truths).toEqual(["The sun is a door"]);
    const text = worldBlockText(block) + worldImageSetting(block);
    expect(text).not.toContain("lich");
    expect(text).not.toContain("king is dead");
  });

  it("ignores forces, secrets, questions, lore and chronicle entries entirely", () => {
    const block = worldBlockFromRows(null, [
      row({ part: "force", title: "The Pale Court" }),
      row({ part: "secret", title: "Hidden crypt" }),
      row({ part: "lore", title: "Old war" }),
    ]);
    expect(worldBlockText(block)).toBe("");
  });

  it("reads a premise entry's title, falling back to its body as plain text", () => {
    const body = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A drowned kingdom." }] }],
    });
    const block = worldBlockFromRows(null, [premise("pitch", "", body)]);
    expect(block.pitch).toBe("A drowned kingdom.");
  });

  // Bug caught: a pitch with a heading and a body (the book import) reached every generator as its heading alone.
  it("reads a text premise's body under its heading, and the title alone when there is no body", () => {
    const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A drowned kingdom." }] }] });
    expect(worldBlockFromRows(null, [premise("pitch", "The Sunken Crown", body)]).pitch).toBe("The Sunken Crown: A drowned kingdom.");
    expect(worldBlockFromRows(null, [premise("voice", "Dry and warm", null)]).voice).toBe("Dry and warm");
    expect(worldBlockFromRows(null, [premise("line", "Gore", body)]).lines).toEqual(["Gore"]);
  });

  // Bug caught: a secret block inside a premise body went to every generator.
  it("never lets a DM-only block of a premise body through", () => {
    const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Open." }] }, { type: "secretBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "HIDDEN" }] }] }] });
    expect(worldBlockFromRows(null, [premise("pitch", "", body)]).pitch).toBe("Open.");
  });

  it("orders entries by sort_order and joins several voice entries", () => {
    const block = worldBlockFromRows(null, [
      row({ part: "premise", premise_kind: "voice", title: "second", sort_order: 5 }),
      row({ part: "premise", premise_kind: "voice", title: "first", sort_order: 1 }),
    ]);
    expect(block.voice).toBe("first\n\nsecond");
  });
});

describe("worldBlockText", () => {
  it("is empty for a campaign with no canon, so a prompt gains nothing", () => {
    expect(worldBlockText(worldBlockFromRows(null, []))).toBe("");
    expect(worldBlockText(worldBlockFromRows("   ", []))).toBe("");
  });

  it("renders lines and veils as binding rules, not as flavour", () => {
    const text = worldBlockText(
      worldBlockFromRows("Sothery", [
        premise("line", "Harm to children"),
        premise("veil", "Torture"),
      ]),
    );
    expect(text).toContain("Never include, in any form:\n- Harm to children");
    expect(text).toContain("May happen, but only off the page:\n- Torture");
  });

  it("names the world, pitch, voice and truths under their headings and leaves empty ones out", () => {
    const text = worldBlockText(
      worldBlockFromRows("Sothery", [
        premise("pitch", "Cosy horror"),
        premise("voice", "Dry and warm"),
        truth("all", "Winter never ends"),
      ]),
    );
    expect(text).toContain("## World\nSothery");
    expect(text).toContain("## Pitch\nCosy horror");
    expect(text).toContain("## Voice\nDry and warm");
    expect(text).toContain("## Truths of the world\n- Winter never ends");
    expect(text).not.toContain("## Themes");
    expect(text).not.toContain("## Lines");
  });
});

describe("worldImageSetting", () => {
  it("carries the name, the look and the lines, never the pitch or the voice", () => {
    const setting = worldImageSetting(
      worldBlockFromRows("Sothery", [
        premise("pitch", "SECRET-PITCH-MARKER"),
        premise("voice", "VOICE-MARKER"),
        premise("look", "Gouache, muted greens"),
        premise("line", "Gore"),
      ]),
    );
    expect(setting).toContain("Sothery");
    expect(setting).toContain("Gouache, muted greens");
    expect(setting).toContain("Never depict: Gore");
    expect(setting).not.toContain("PITCH");
    expect(setting).not.toContain("VOICE");
  });

  // Bug caught: an old setting prompt that carried the visual style (migrated into the pitch) was lost from every picture.
  it("falls back to the pitch, capped, when there is no look, and still never carries the voice", () => {
    const setting = worldImageSetting(
      worldBlockFromRows("Sothery", [premise("pitch", `Watercolour fens. ${"x".repeat(600)}`), premise("voice", "VOICE-MARKER")]),
    );
    expect(setting).toContain("Setting: Watercolour fens.");
    expect(setting.length).toBeLessThan(450);
    expect(setting).not.toContain("VOICE");
  });

  it("is empty when there is nothing to say", () => {
    expect(worldImageSetting(worldBlockFromRows(null, []))).toBe("");
  });
});
