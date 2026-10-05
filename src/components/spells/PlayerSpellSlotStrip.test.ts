import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PlayerSpellSlotStrip from "@/components/spells/PlayerSpellSlotStrip.vue";
import type { SpellSlotEntry } from "@/types/party.types";

const slots: SpellSlotEntry[] = [
  { level: 2, max: 3, used: 1 },
  { level: 1, max: 4, used: 0 },
  { level: 3, max: 2, used: 2, pool: "pact" },
];

describe("PlayerSpellSlotStrip", () => {
  it("lists every level with remaining / max, pact magic labelled apart", () => {
    const text = mount(PlayerSpellSlotStrip, { props: { spellSlots: slots } }).text();
    expect(text).toContain("1st level");
    expect(text).toContain("4 / 4");
    expect(text).toContain("2nd level");
    expect(text).toContain("2 / 3");
    expect(text).toContain("Pact Magic 3rd");
    expect(text).toContain("0 / 2");
    expect(text.indexOf("1st level")).toBeLessThan(text.indexOf("Pact Magic"));
  });

  it("emits the new used count when a pip is tapped", async () => {
    const wrapper = mount(PlayerSpellSlotStrip, { props: { spellSlots: slots } });
    const secondLevel = wrapper.findAll("button").filter((b) => b.attributes("aria-label")?.startsWith("2nd level"));
    await secondLevel[1].trigger("click"); // pip 2 is filled: spend it and the one to its right
    expect(wrapper.emitted("set-used")?.[0]).toEqual([slots[0], 2]);
    await secondLevel[2].trigger("click"); // pip 3 is empty: restore it
    expect(wrapper.emitted("set-used")?.[1]).toEqual([slots[0], 0]);
  });

  it("renders nothing for a character without slots", () => {
    expect(mount(PlayerSpellSlotStrip, { props: { spellSlots: [] } }).html()).toBe("<!--v-if-->");
  });
});
