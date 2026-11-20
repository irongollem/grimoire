import { describe, expect, it } from "vitest";
import { canonEmbedHtml } from "./canonEmbedHtml";

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("canonEmbedHtml", () => {
  it("sets a truth and a question as one escaped line", () => {
    expect(canonEmbedHtml({ kind: "truth", title: "A < B" })).toContain("<p>A &lt; B</p>");
    expect(canonEmbedHtml({ kind: "question", title: "Who?" })).toContain("<p>Who?</p>");
  });

  it("sets lore as title, kind and date, its body and each passage under its heading in order", () => {
    const html = canonEmbedHtml({
      kind: "lore", title: "The Fall", loreKind: "history", date: "Year 12", body: doc("It fell."),
      passages: [{ title: "First", body: doc("one") }, { title: "Second", body: doc("two") }],
    });
    expect(html).toContain("The Fall");
    expect(html).toContain("History · Year 12");
    expect(html.indexOf("It fell.")).toBeLessThan(html.indexOf("First"));
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("one"));
    expect(html.indexOf("one")).toBeLessThan(html.indexOf("Second"));
  });

  it("sets a force as who, wants and its steps, and a secret with its clues and where they lie", () => {
    const force = canonEmbedHtml({ kind: "force", title: "Cult", wants: "The tide", steps: ["Gather", "Drown"] });
    expect(force).toContain("<strong>Wants</strong> The tide");
    expect(force).toContain("<li>Gather</li><li>Drown</li>");
    const secret = canonEmbedHtml({ kind: "secret", title: "King dead", clues: [{ title: "A ring", where: "The Vault" }, { title: "A rumour", where: null }] });
    expect(secret).toContain("A ring <em>(The Vault)</em>");
    expect(secret).toContain("<li>A rumour</li>");
  });

  it("prints no clues heading for a secret with none", () => {
    expect(canonEmbedHtml({ kind: "secret", title: "King dead", clues: [] })).not.toContain("Clues");
  });
});
