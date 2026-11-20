import { describe, expect, it } from "vitest";
import type { AiProvenance } from "@/ai/provenance";
import type { ExtractedCanon } from "@/types/documentImport.types";
import { mapExtractedCanon, mapExtractedDeity } from "./normalize";

const PROVENANCE: AiProvenance = {
  generatorType: "document_import",
  provider: "anthropic",
  model: "claude-test",
  generatedAt: "2026-11-20T00:00:00.000Z",
  edited: false,
};

const canon = (data: Partial<ExtractedCanon> & Pick<ExtractedCanon, "title" | "part">) => mapExtractedCanon(data, "c1", PROVENANCE);

describe("mapExtractedDeity", () => {
  it("maps a god onto the deities columns with no player seeing it and no pantheon guessed", () => {
    const { row, links } = mapExtractedDeity(
      { name: "Bell-Note", titles: "The Quiet Hour", domains: ["Knowledge", " "], portfolio: "bells and silence", alternate_names: ["Old Chime"], description: "A patient power." },
      "c1",
      PROVENANCE,
    );
    expect(row).toMatchObject({
      campaign_id: "c1",
      name: "Bell-Note",
      titles: "The Quiet Hour",
      domains: ["Knowledge"],
      portfolio: "bells and silence",
      alternate_names: ["Old Chime"],
      pantheon_id: null,
      player_visible_to: [],
      ai_provenance: PROVENANCE,
    });
    expect(JSON.parse(row.description!).type).toBe("doc");
    expect(links).toEqual({});
  });
});

describe("mapExtractedCanon", () => {
  it("never writes a premise line or veil, however the model spelled it: those are agreed with the players", () => {
    expect(canon({ title: "No harm to children", part: "premise", premise_kind: "line" }).row.premise_kind).not.toBe("line");
    expect(canon({ title: "x", part: "premise", premise_kind: "veil" }).row.premise_kind).not.toBe("veil");
    expect(canon({ title: "x", part: "premise", premise_kind: "voice" }).row.premise_kind).toBe("voice");
  });

  it("gives a premise a kind and every other part none, so the database's premise check holds", () => {
    expect(canon({ title: "x", part: "premise", premise_kind: "bogus" }).row.premise_kind).toBe("theme");
    expect(canon({ title: "x", part: "truth", knowledge: "all", premise_kind: "pitch" }).row.premise_kind).toBeNull();
  });

  it("reads an unknown knowledge mark as secret, and does not mistake 'small' for 'all'", () => {
    expect(canon({ title: "x", part: "truth", knowledge: "small" }).row.knowledge).toBe("secret");
    expect(canon({ title: "x", part: "truth", knowledge: "ALL" }).row.knowledge).toBe("all");
    expect(canon({ title: "x", part: "secret", knowledge: "all" }).row.knowledge).toBeNull();
  });

  it("carries who knows a truth only when it is known to some", () => {
    expect(canon({ title: "x", part: "truth", knowledge: "some", known_to: ["Tam", "  "] }).links.canon?.known_to).toEqual(["Tam"]);
    expect(canon({ title: "x", part: "truth", knowledge: "all", known_to: ["Tam"] }).links.canon?.known_to).toEqual([]);
  });

  it("keeps wants, steps and quests on a force and drops them off every other part (the database refuses wants elsewhere)", () => {
    const force = canon({ title: "The Ferrymen", part: "force", wants: "the bridge", steps: ["buy the bridge", ""], quests: ["The Sunken Bell"] });
    expect(force.row.wants).toBe("the bridge");
    expect(force.links.canon).toMatchObject({ steps: ["buy the bridge"], quests: ["The Sunken Bell"] });
    const truth = canon({ title: "x", part: "truth", knowledge: "all", wants: "no", steps: ["no"], quests: ["no"] });
    expect(truth.row.wants).toBeNull();
    expect(truth.links.canon).toMatchObject({ steps: [], quests: [] });
  });

  it("keeps clues only on a secret and passages only on lore, so a child never lands under the wrong parent", () => {
    const secret = canon({ title: "Who rang it", part: "secret", clues: [{ title: "a locket", where: "The Dock" }, { title: " " }], passages: [{ title: "no" }] });
    expect(secret.links.canon?.clues).toEqual([{ title: "a locket", where: "The Dock" }]);
    expect(secret.links.canon?.passages).toEqual([]);
    const lore = canon({ title: "The Flood", part: "lore", passages: [{ title: "What all know", text: "It rained." }], clues: [{ title: "no" }] });
    expect(lore.links.canon?.passages).toHaveLength(1);
    expect(lore.links.canon?.passages[0]).toMatchObject({ title: "What all know" });
    expect(JSON.parse(lore.links.canon!.passages[0]!.bodyJson!).type).toBe("doc");
    expect(lore.links.canon?.clues).toEqual([]);
  });

  it("keeps a lore kind and date only on lore, and never a month without a year or a day without a month", () => {
    const lore = canon({ title: "The Flood", part: "lore", lore_kind: "history", world_year: 412, world_month: 3, world_day: 9 });
    expect(lore.row).toMatchObject({ lore_kind: "history", world_year: 412, world_month: 3, world_day: 9 });
    expect(canon({ title: "x", part: "lore", world_month: 3, world_day: 9 }).row).toMatchObject({ world_year: null, world_month: null, world_day: null });
    expect(canon({ title: "x", part: "lore", world_year: 5, world_day: 9 }).row).toMatchObject({ world_year: 5, world_month: null, world_day: null });
    expect(canon({ title: "x", part: "truth", knowledge: "all", lore_kind: "history", world_year: 5 }).row).toMatchObject({ lore_kind: null, world_year: null });
  });

  it("reads an unknown part as lore rather than inventing a chronicle entry, and never sets a clock or a reveal", () => {
    const { row } = canon({ title: "x", part: "chronicle" as ExtractedCanon["part"] });
    expect(row.part).toBe("lore");
    expect(row).not.toHaveProperty("revealed_at");
    expect(row).not.toHaveProperty("clock_size");
  });
});
