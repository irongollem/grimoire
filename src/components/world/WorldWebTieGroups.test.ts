import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorldWebTieGroups from "./WorldWebTieGroups.vue";
import { groupTies } from "@/lib/worldWeb/ties";
import { tie } from "@/lib/worldWeb/tieFixture";

const ties = [
  tie({ row_id: "1" }),
  tie({ row_id: "2", from_id: "ama", from_name: "Sister Ama", type: "serves" }),
  tie({ row_id: "3", source: "membership", type: "member_of", from_id: "harl", from_name: "Harl", to_kind: "faction", to_id: "toll", to_name: "Toll-men", role: "Leader", status: "Active" }),
  tie({ row_id: "4", source: "quest", type: "quest_giver", from_kind: "quest", from_id: "q", from_name: "The Ferry Bell", to_kind: "deity", status: "active" }),
];

function mountGroups(editable: boolean) {
  return mount(WorldWebTieGroups, {
    props: { groups: groupTies(ties, "deity:lady"), subjectKey: "deity:lady", subjectName: "The Drowned Lady", editable },
  });
}

describe("WorldWebTieGroups", () => {
  it("answers in words read from the subject, over the ones they name", () => {
    const text = mountGroups(false).text();
    expect(text).toContain("Worshipped by");
    expect(text).toContain("Brenna Ashe");
    expect(text).toContain("Served by");
    expect(text).toContain("Sister Ama");
  });

  it("tapping a row moves the focus to it", async () => {
    const w = mountGroups(false);
    const row = w.findAll("button").find((b) => b.text().includes("Sister Ama"))!;
    await row.trigger("click");
    expect(w.emitted("node")?.[0]).toEqual(["npc:ama"]);
  });

  it("gives a player no way to edit", () => {
    const w = mountGroups(false);
    expect(w.findAll("button").filter((b) => b.attributes("aria-label")?.startsWith("Edit how"))).toHaveLength(0);
  });

  it("gives the DM an editor per tie, but none for a quest's", async () => {
    const w = mountGroups(true);
    const edits = w.findAll("button").filter((b) => b.attributes("aria-label")?.startsWith("Edit how"));
    expect(edits.map((b) => b.attributes("aria-label"))).not.toContain("Edit how The Ferry Bell is tied");
    expect(edits.length).toBe(2);
    await edits.find((b) => b.attributes("aria-label") === "Edit how Sister Ama is tied")!.trigger("click");
    expect(w.text()).toContain("What players are told");
    expect(w.text()).toContain("Remove this tie");
  });

  it("removing from the editor emits the tie", async () => {
    const w = mountGroups(true);
    await w.findAll("button").find((b) => b.attributes("aria-label") === "Edit how Sister Ama is tied")!.trigger("click");
    await w.findAll("button").find((b) => b.text().includes("Remove this tie"))!.trigger("click");
    expect(w.emitted("remove")?.[0]?.[0]).toMatchObject({ row_id: "2" });
  });

  it("says a membership's role and a quest's status", () => {
    const text = mount(WorldWebTieGroups, {
      props: { groups: groupTies(ties, "faction:toll"), subjectKey: "faction:toll", subjectName: "Toll-men" },
    }).text();
    expect(text).toContain("Leader");
  });

  it("says so when nothing is tied", () => {
    const w = mount(WorldWebTieGroups, { props: { groups: [], subjectKey: "item:bell", subjectName: "The Ferry Bell" } });
    expect(w.text()).toContain("Nothing is tied to this yet.");
  });
  describe("what each row says under its name", () => {
    const rowsFor = (rows: ReturnType<typeof tie>[], subject: string) =>
      mount(WorldWebTieGroups, { props: { groups: groupTies(rows, subject), subjectKey: subject, subjectName: "S" } }).text();

    it("says a plain member's tie without a caption, a role by its word, and a quest by its status", () => {
      const plain = tie({ row_id: "m", source: "membership", type: "member_of", from_id: "harl", from_name: "Harl", to_kind: "faction", to_id: "toll", to_name: "Toll-men", role: null, status: "Active" });
      expect(rowsFor([plain], "faction:toll")).not.toMatch(/Member\b(?!s)/);
      const quest = tie({ row_id: "q", source: "quest", type: "quest_giver", from_kind: "quest", from_id: "q", from_name: "The Ferry Bell", to_kind: "deity", status: "active" });
      expect(rowsFor([quest], "deity:lady")).toContain("active");
    });

    it("shows the line players are told on a link, and never the DM's private note", () => {
      const link = tie({ row_id: "l", told: "Prays at dusk", note: "secretly a cultist" });
      const text = rowsFor([link], "deity:lady");
      expect(text).toContain("Prays at dusk");
      expect(text).not.toContain("secretly a cultist");
    });
  });

  describe("the DM's editor", () => {
    const link = tie({ row_id: "2", from_id: "ama", from_name: "Sister Ama", type: "serves", told: "Keeps the lamp", note: "Owes a debt" });
    const mountEditor = (subjectKey = "deity:lady") =>
      mount(WorldWebTieGroups, { props: { groups: groupTies([link], subjectKey), subjectKey, subjectName: "The Drowned Lady", editable: true } });
    const open = (w: ReturnType<typeof mountEditor>) =>
      w.findAll("button").find((b) => b.attributes("aria-label") === "Edit how Sister Ama is tied")!.trigger("click");

    it("opens on the words already stored, and Save stays off until one is changed", async () => {
      const w = mountEditor();
      await open(w);
      const told = w.get(`#told-2`).element as HTMLInputElement;
      const note = w.get(`#note-2`).element as HTMLInputElement;
      expect([told.value, note.value]).toEqual(["Keeps the lamp", "Owes a debt"]);
      const save = () => w.findAll("button").find((b) => b.text() === "Save")!;
      expect(save().attributes("disabled")).toBeDefined();
      await w.get(`#told-2`).setValue("Keeps the lamp lit");
      expect(save().attributes("disabled")).toBeUndefined();
      await save().trigger("click");
      expect(w.emitted("words")?.[0]).toEqual([expect.objectContaining({ row_id: "2" }), { note: "Owes a debt", told: "Keeps the lamp lit" }]);
    });

    it("closes an open editor when the list becomes another subject's", async () => {
      const w = mountEditor();
      await open(w);
      expect(w.text()).toContain("Remove this tie");
      // The same tie is listed from the other end too, so only the subject change can close the editor.
      await w.setProps({ subjectKey: "npc:ama", groups: groupTies([link], "npc:ama") });
      expect(w.text()).toContain("The Drowned Lady");
      expect(w.text()).not.toContain("Remove this tie");
    });
  });
});
