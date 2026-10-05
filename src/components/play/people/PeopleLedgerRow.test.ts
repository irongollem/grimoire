import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PeopleLedgerRow from "@/components/play/people/PeopleLedgerRow.vue";
import type { PlayerNpc } from "@/types/npc.types";

function npc(overrides: Partial<PlayerNpc> = {}): PlayerNpc {
  return {
    id: "n1",
    name: "Mira Thorne",
    status: "alive",
    relationship: "friendly",
    race: "Human",
    occupation: "Apothecary",
    portrait_url: "https://example.invalid/mira.webp",
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: false,
    player_visible_fields: ["name", "portrait", "race", "occupation"],
    ...overrides,
  } as unknown as PlayerNpc;
}

function mountRow(props: { npc: PlayerNpc; rating?: number; isNew?: boolean }) {
  return mount(PeopleLedgerRow, { props, global: { stubs: { FocalImage: true } } });
}

describe("PeopleLedgerRow", () => {
  it("shows the name, species and occupation, and no status word when alive", () => {
    const wrapper = mountRow({ npc: npc() });
    expect(wrapper.text()).toContain("Mira Thorne");
    expect(wrapper.text()).toContain("Human · Apothecary");
    expect(wrapper.text()).not.toContain("Alive");
    expect(wrapper.text()).toContain("friendly");
  });

  it("sets a nameless person as ??? with the not-yet-known line", () => {
    const wrapper = mountRow({
      npc: npc({ name: null, race: null, occupation: null, player_visible_fields: [] }),
    });
    expect(wrapper.text()).toContain("???");
    expect(wrapper.text()).toContain("Name not yet known to you");
    expect(wrapper.find(".people-nameless").exists()).toBe(true);
  });

  it("strikes the name through, greys the portrait and says Dead for the dead", () => {
    const wrapper = mountRow({ npc: npc({ status: "dead" }) });
    expect(wrapper.text()).toContain("Dead");
    expect(wrapper.find(".line-through").exists()).toBe(true);
    expect(wrapper.findComponent({ name: "FocalImage" }).classes()).toContain("grayscale");
  });

  it("shows the unread dot only for a person the DM changed since the last look", () => {
    expect(mountRow({ npc: npc(), isNew: true }).find('[aria-label="New"]').exists()).toBe(true);
    expect(mountRow({ npc: npc() }).find('[aria-label="New"]').exists()).toBe(false);
  });

  it("renders read-only stars for a rated person", () => {
    const wrapper = mountRow({ npc: npc(), rating: 3 });
    expect(wrapper.find('[aria-label="Your rating: 3 of 5"]').text()).toBe("★★★");
  });
});
