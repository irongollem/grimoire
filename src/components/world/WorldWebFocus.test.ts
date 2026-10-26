import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorldWebFocus from "./WorldWebFocus.vue";
import { buildFocus, indexTies } from "@/lib/worldWeb/focus";
import { entityDirectory } from "@/lib/worldWeb/model";
import { tie } from "@/lib/worldWeb/tieFixture";

const ties = [
  tie({ row_id: "1" }),
  tie({ row_id: "2", source: "patron_deity", type: "patron_deity", from_kind: "party_member", from_id: "ilse", from_name: "Ilse Thane" }),
  tie({ row_id: "3", source: "membership", type: "member_of", from_id: "harl", from_name: "Harl", to_kind: "faction", to_id: "toll", to_name: "Toll-men" }),
  tie({ row_id: "4", type: "opposes", from_kind: "faction", from_id: "toll", from_name: "Toll-men", to_kind: "deity" }),
];

function mountFocus(steps: 1 | 2 = 1) {
  const focus = buildFocus(indexTies(ties), "deity:lady", steps, (k) => k);
  return mount(WorldWebFocus, { props: { focus, directory: entityDirectory(ties, []) } });
}

describe("WorldWebFocus", () => {
  it("draws the centre and a node per tie with the reason written under it", () => {
    const text = mountFocus().text();
    expect(text).toContain("The Drowned Lady");
    expect(text).toContain("Brenna Ashe");
    expect(text).toContain("worships");
    expect(text).toContain("patron deity");
    expect(text).toContain("opposes");
  });

  it("draws a record as a dashed spoke and a link solid", () => {
    const lines = mountFocus().findAll("line");
    expect(lines.filter((l) => l.attributes("stroke-dasharray")).length).toBe(1);
    expect(lines.filter((l) => !l.attributes("stroke-dasharray")).length).toBe(2);
  });

  it("brings in the second step only when asked", () => {
    expect(mountFocus(1).text()).not.toContain("Harl");
    expect(mountFocus(2).text()).toContain("Harl");
  });

  it("a tap or Enter on a node asks to move the focus there", async () => {
    const w = mountFocus();
    const brenna = w.findAll("g[role=button]").find((g) => g.attributes("aria-label")?.startsWith("Brenna"))!;
    await brenna.trigger("click");
    await brenna.trigger("keydown.enter");
    expect(w.emitted("node")).toEqual([["npc:brenna"], ["npc:brenna"]]);
  });
});
