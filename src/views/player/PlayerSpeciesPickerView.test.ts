import { shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerSpeciesPickerView from "./PlayerSpeciesPickerView.vue";

const picker = vi.hoisted(() => ({ isOther: false }));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/party/useCharacterSpells", () => ({
  applySpeciesSpellGrants: vi.fn(),
  removeSpeciesSpellGrants: vi.fn(),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ provideCharacterRuleset: vi.fn() }));
vi.mock("@/composables/rules/useSpecies", () => ({ useAllSpecies: () => ({ data: ref([]) }) }));
vi.mock("@/composables/party/usePickerCharacter", () => ({
  usePickerCharacter: () => ({
    member: ref({ id: "pm2", name: "Thorin", species_id: "dwarf", languages: [] }),
    notFound: ref(false),
    isOtherCharacter: ref(picker.isOther),
    afterChangeRoute: () => "/play/character",
  }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  picker.isOther = false;
});

describe("PlayerSpeciesPickerView", () => {
  // The top bar names the active character, so a pick for another one
  // (`?memberId=`) is the only time the page must say whose sheet changes.
  it("names the character only when choosing for one that is not the active character", () => {
    expect(shallowMount(PlayerSpeciesPickerView).text()).not.toContain("Thorin");

    picker.isOther = true;
    expect(shallowMount(PlayerSpeciesPickerView).text()).toContain("Choosing for Thorin");
  });
});
