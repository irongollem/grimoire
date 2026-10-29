import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PlayerPartyCompanionLightbox from "./PlayerPartyCompanionLightbox.vue";
import type { Companion } from "@/types/companion.types";

vi.mock("@/composables/encounters/useCompanions", () => ({
  useUpdateCompanion: () => ({ mutateAsync: vi.fn() }),
  useDeleteCompanion: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), fromError: String }) }));

const EntityLightbox = {
  template: '<div><slot name="portrait-overlay" /><slot /><slot name="footer" /></div>',
};

function companion(type: Companion["companion_type"]): Companion {
  return {
    id: "c1", name: "Biscuit", companion_type: type, combat_ready: type !== "pet",
    owner_party_member_id: "pm-1", max_hp: 4, current_hp: 4, ac: 11, speed: 20, conditions: [],
    portrait_url: null, portrait_focal_point: null,
  } as unknown as Companion;
}

function mountLightbox(type: Companion["companion_type"]) {
  return mount(PlayerPartyCompanionLightbox, {
    props: { companion: companion(type), ownerName: "Mira", viewerMemberId: "pm-1" },
    global: { stubs: { EntityLightbox, PlayerNotesWidget: true, ExhaustionChip: true } },
  });
}

// #1115: nobody drives a pet and it never fights, so its owner gets no HP stepper,
// status toggle or condition picker, but still owns Edit and Delete.
describe("PlayerPartyCompanionLightbox controls", () => {
  it("gives the owner of a familiar the HP stepper, status toggle and condition picker", () => {
    const text = mountLightbox("familiar").text();
    expect(text).toContain("DMG");
    expect(text).toContain("With the party");
    expect(text).toContain("+ Condition");
  });

  it("takes them all away from the owner of a pet, keeping Edit and Delete and the stats", () => {
    const wrapper = mountLightbox("pet");
    const text = wrapper.text();
    expect(text).not.toContain("DMG");
    expect(text).not.toContain("With the party");
    expect(text).not.toContain("+ Condition");
    expect(text).toContain("Edit");
    expect(text).toContain("Delete");
    expect(text).toContain("11"); // AC still shown
  });
});
