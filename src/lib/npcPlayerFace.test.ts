import { describe, it, expect } from "vitest";
import { getNpcPlayerFace } from "./npcPlayerFace";

describe("getNpcPlayerFace", () => {
  const base = { name: "Johnny Reed", portrait_url: "johnny.webp", portrait_focal_point: { x: 1, y: 2 }, disguise_name: null, disguise_portrait_url: null, disguise_portrait_focal_point: null, is_revealed: false, player_visible_fields: ["name", "portrait"] };

  // Bug caught: a portrait the DM hid from players (get_player_visible_npcs returns null for it) stored in the shared chat.
  it("hands players no portrait unless 'portrait' is shared, and no name unless 'name' is", () => {
    expect(getNpcPlayerFace({ ...base, player_visible_fields: ["name"] })).toEqual({ name: "Johnny Reed", portrait: null, focal: null });
    expect(getNpcPlayerFace({ ...base, player_visible_fields: ["portrait"] })).toMatchObject({ name: null, portrait: "johnny.webp" });
    expect(getNpcPlayerFace(base)).toEqual({ name: "Johnny Reed", portrait: "johnny.webp", focal: { x: 1, y: 2 } });
  });

  // Bug caught: the true name or face of a concealed NPC shown to players while the cover holds.
  it("shows the cover while concealed and the true face once revealed, as the projection does", () => {
    const covered = { ...base, disguise_name: "Old Tam", disguise_portrait_url: "tam.webp", disguise_portrait_focal_point: { x: 9, y: 9 } };
    expect(getNpcPlayerFace(covered)).toEqual({ name: "Old Tam", portrait: "tam.webp", focal: { x: 9, y: 9 } });
    expect(getNpcPlayerFace({ ...covered, is_revealed: true })).toMatchObject({ name: "Johnny Reed", portrait: "johnny.webp" });
    // The cover's portrait is only the cover's: a name-only disguise keeps the true portrait.
    expect(getNpcPlayerFace({ ...base, disguise_name: "Old Tam" })).toMatchObject({ name: "Old Tam", portrait: "johnny.webp" });
    // The cover's portrait is still withheld when the DM has not shared 'portrait'.
    expect(getNpcPlayerFace({ ...covered, player_visible_fields: ["name"] }).portrait).toBeNull();
  });
});
