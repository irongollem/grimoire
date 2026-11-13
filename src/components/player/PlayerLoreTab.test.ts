import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const updateMember = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const bgRow = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));

vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: updateMember }) }));
vi.mock("@/composables/rules/useBackgrounds", () => ({
  backgroundSourceKey: () => "k",
  useBackground: () => ({ data: ref(bgRow.value) }),
}));
vi.mock("@/composables/deities/useDeities", () => ({ useAllDeities: () => ({ data: ref([]) }) }));
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: () => null }) }));
// The editing behaviour itself is TapToEditRichText's; here it is a field that emits when typed into.
vi.mock("@/components/common/richtext/TapToEditRichText.vue", () => ({
  __esModule: true,
  default: {
    props: ["modelValue", "label"],
    emits: ["update:modelValue"],
    template: `<button type="button" class="tte" :data-label="label" @click="$emit('update:modelValue', 'new ' + label)" />`,
  },
}));

import PlayerLoreTab from "./PlayerLoreTab.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { PartyMember } from "@/types/party.types";

const member = (over: Partial<PartyMember> = {}) => ({ id: "m1", notes: null, bonds: null, ...over }) as unknown as PartyMember;
const field = (w: ReturnType<typeof mount>, label: string) => w.get(`.tte[data-label="${label}"]`);

describe("PlayerLoreTab tap-to-edit", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    updateMember.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("lets the owner edit notes, saved through the same autosave as bonds", async () => {
    const w = mount(PlayerLoreTab, { props: { member: member(), isOwner: true } });
    await field(w, "notes").trigger("click");
    expect(updateMember).not.toHaveBeenCalled(); // debounced, not per keystroke
    await vi.advanceTimersByTimeAsync(600);
    expect(updateMember).toHaveBeenCalledWith({ id: "m1", update: { notes: "new notes" } });
  });

  it("shows the owner a notes field even when there are no notes yet", () => {
    const w = mount(PlayerLoreTab, { props: { member: member(), isOwner: true } });
    expect(w.find('.tte[data-label="notes"]').exists()).toBe(true);
  });

  it("gives other players read-only notes and no editors", () => {
    const w = mount(PlayerLoreTab, { props: { member: member({ notes: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hidden past" }] }] }) }), isOwner: false } });
    expect(w.find(".tte").exists()).toBe(false);
    expect(w.text()).toContain("Hidden past");
  });

  it("saves only the field that changed", async () => {
    const w = mount(PlayerLoreTab, { props: { member: member(), isOwner: true } });
    await field(w, "bonds").trigger("click");
    await vi.advanceTimersByTimeAsync(600);
    expect(updateMember).toHaveBeenCalledWith({ id: "m1", update: { bonds: "new bonds" } });
  });
});

describe("PlayerLoreTab low art (#1179)", () => {
  const { setLowArt } = useLowArt();
  beforeEach(() => {
    setActivePinia(createPinia());
    bgRow.value = { id: "b1", name: "Sage", image_url: "https://cdn.test/sage.webp", focal_point: null, skill_proficiencies: [], tool_proficiencies: [], languages: [] };
  });
  afterEach(() => {
    setLowArt(false);
    bgRow.value = null;
  });

  it("draws the background thumbnail when low art is off (the control for the guard below)", () => {
    const w = mount(PlayerLoreTab, { props: { member: member(), isOwner: false } });
    expect(w.find("img").exists()).toBe(true);
  });

  it("the background card still downloads its thumbnail in low art, and the name starts the card", () => {
    setLowArt(true);
    const w = mount(PlayerLoreTab, { props: { member: member(), isOwner: false } });
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("Sage");
  });
});
