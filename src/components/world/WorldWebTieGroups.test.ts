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
});
