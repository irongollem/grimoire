import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NpcDisguisePanel from "./NpcDisguisePanel.vue";
import NpcGridCard from "./NpcGridCard.vue";
import NpcPartyRow from "./NpcPartyRow.vue";
import NpcSetThumbs from "./NpcSetThumbs.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { NpcListRow } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";

// The party row and the reveal control read connections and the reveal state through queries.
vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: vi.fn(), isPending: { value: false } }),
  useRetypeConnection: () => ({ mutateAsync: vi.fn() }),
  useUpdateLink: () => ({ mutateAsync: vi.fn() }),
  useRemoveConnection: () => ({ mutateAsync: vi.fn() }),
}));

const { setLowArt } = useLowArt();
// Hooks run last-registered first: unmount before the switch flips back, so no live tree re-renders.
afterEach(() => {
  setLowArt(false);
});
enableAutoUnmount(afterEach);

const npc = {
  id: "n1",
  name: "Elowen Vance",
  race: "Sugarspun",
  occupation: "Innkeeper",
  status: "alive",
  relationship: "friendly",
  tags: ["baker", "rumours", "a", "b"],
  portrait_url: "https://cdn/elowen.webp",
  disguise_name: "Mara",
  disguise_portrait_url: "https://cdn/mara.webp",
  disguise_portrait_focal_point: null,
  is_revealed: false,
  player_visible_to: [],
  player_visible_fields: [],
} as unknown as NpcListRow;

const revealedNpc = { ...npc, is_revealed: true } as NpcListRow;

const gridStubs = {
  AiImageBadge: true, RouterLink: true, NpcRevealControl: { template: '<i data-testid="reveal" :data-form="form" />', props: ["npc", "form"] } };

describe("NpcGridCard low art (#1179)", () => {
  // Bug: the NPC card still fetches its portrait in low art.
  it("draws no picture, and the eyebrow, title, occupation and tags instead", () => {
    setLowArt(true);
    const card = mount(NpcGridCard, { props: { npc: revealedNpc, locationName: "The Gilded Bun" }, global: { stubs: gridStubs } });
    expect(card.find("img").exists()).toBe(false);
    expect(card.text()).toContain("Sugarspun");
    expect(card.text()).toContain("Elowen Vance");
    expect(card.text()).toContain("Innkeeper");
    expect(card.text()).toContain("The Gilded Bun");
    expect(card.text()).toContain("baker");
    expect(card.text()).toContain("friendly");
    // Title once: the card draws it, the body must not draw a second.
    expect(card.text().match(/Elowen Vance/g)).toHaveLength(1);
  });

  // Bug: the reveal chip keeps its dark overlay scrim, which is a blot on a card with no picture.
  it("sets the reveal control as a plain chip, not an overlay", () => {
    setLowArt(true);
    const card = mount(NpcGridCard, { props: { npc: revealedNpc }, global: { stubs: gridStubs } });
    expect(card.get('[data-testid="reveal"]').attributes("data-form")).toBe("inline");
  });

  it("keeps the plate and the overlay chip with low art off", () => {
    const card = mount(NpcGridCard, { props: { npc: revealedNpc }, global: { stubs: { ...gridStubs, FocalImage: { template: '<i data-testid="plate" />' } } } });
    expect(card.find('[data-testid="plate"]').exists()).toBe(true);
    expect(card.get('[data-testid="reveal"]').attributes("data-form")).toBe("overlay");
  });
});

describe("NpcDisguisePanel low art (#1179)", () => {
  // Bug: the disguise's portrait tile stays as an empty box in low art.
  it("drops the portrait tile and keeps the name and the reveal button", () => {
    setLowArt(true);
    const panel = mount(NpcDisguisePanel, { props: { npc, revealed: false } });
    expect(panel.find("img").exists()).toBe(false);
    expect(panel.find(".h-18").exists()).toBe(false);
    expect(panel.text()).toContain("Mara");
    expect(panel.text()).toContain("Reveal true self");
  });
});

describe("NpcPartyRow low art (#1179)", () => {
  const member = { id: "pm1", name: "Wren Ashdown", class: "Wizard", level: 5, portrait_url: "https://cdn/wren.webp" } as PartyMember;
  // Bug: the character's portrait is fetched on every party row in low art.
  it("draws no portrait and keeps the character's name", () => {
    setLowArt(true);
    const row = mount(NpcPartyRow, { props: { npc, member, shared: true } });
    expect(row.find("img").exists()).toBe(false);
    expect(row.text()).toContain("Wren Ashdown");
  });
});

describe("NpcSetThumbs low art (#1179)", () => {
  // Bug: the set's thumbnail strip downloads every member's portrait in low art.
  it("shows initials instead of portraits", () => {
    setLowArt(true);
    const thumbs = mount(NpcSetThumbs, { props: { members: [npc] } });
    expect(thumbs.find("img").exists()).toBe(false);
    expect(thumbs.get('[data-testid="npc-initial"]').text()).toBe("M");
  });

  it("shows the portraits with low art off", () => {
    expect(mount(NpcSetThumbs, { props: { members: [npc] } }).findAll("img")).toHaveLength(1);
  });
});
