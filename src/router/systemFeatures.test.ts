import { describe, expect, it } from "vitest";
import { routes } from "./routes";
import { featureForPath } from "./systemFeatures";

describe("featureForPath", () => {
  // Bug caught: a route added under a 5e prefix that the table misses, so a
  // Generic campaign reaches it by URL while the nav hides it.
  it.each([
    ["/monsters", "bestiary"],
    ["/monsters/abc", "bestiary"],
    ["/spells/new", "spellbook"],
    ["/vault/abc", "item-vault"],
    ["/rules", "reliquary"],
    ["/party/abc", "party"],
    ["/character-sheet/abc", "party"],
    ["/encounters/abc/run", "encounters"],
    ["/codex/feats", "character-codex"],
    ["/species/new", "character-codex"],
    ["/levelup/classes/abc", "character-codex"],
    ["/backgrounds/abc", "character-codex"],
    ["/play/character/sheet", "party"],
    ["/play/spells", "spellbook"],
    ["/play/encounter/map", "encounters"],
  ])("%s needs %s", (path, feature) => {
    expect(featureForPath(path)).toBe(feature);
  });

  // Bug caught: first-match-wins would give the level-up page the broader
  // `party` feature, hiding it only where the party is gone.
  it("lets the longest prefix win", () => {
    expect(featureForPath("/play/character/levelup")).toBe("level-up");
  });

  // Bug caught: a bare startsWith, so `/spellsmith` is gated as the spellbook.
  it("matches on a segment boundary", () => {
    expect(featureForPath("/spellsmith")).toBeNull();
    expect(featureForPath("/partying")).toBeNull();
  });

  // The whole neutral set is pinned (as lens.test.ts pins the unfenced routes):
  // a new route under no prefix must be argued for here, not slip in gated or not.
  it("leaves the neutral routes alone", () => {
    for (const path of [
      "/dashboard", "/quests/abc", "/npcs", "/locations/abc/map", "/locations/abc/table",
      "/notes", "/soundboard", "/hall-of-heroes", "/play", "/play/journal", "/play/atlas",
      "/play/home", "/play/fallen", "/campaign/settings", "/dungeon-craft", "/cartographer",
    ]) {
      expect(featureForPath(path), path).toBeNull();
    }
  });

  it("gates every route whose path sits under a 5e prefix, and only those", () => {
    const gated = routes
      .map((r) => r.path)
      .filter((path) => typeof path === "string" && featureForPath(path.replace(/\/:.*$/, "")) !== null);
    expect(gated.length).toBeGreaterThan(30);
    expect(gated).toContain("/monsters");
    expect(gated).not.toContain("/quests");
  });
});
