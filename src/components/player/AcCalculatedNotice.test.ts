import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import AcCalculatedNotice from "@/components/player/AcCalculatedNotice.vue";
import type { PartyMember } from "@/types/party.types";

const update = vi.fn().mockResolvedValue(undefined);
const ready = ref(true);
const total = ref(11);

vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: update }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (_e: unknown, m: string) => m }) }));
vi.mock("@/composables/party/useArmorClass", () => ({
  useArmorClass: () => ({
    isReady: ready,
    acBreakdownFor: () => ({ total: total.value, parts: [{ label: "Base", value: 10 }, { label: "Dexterity", value: 1 }], notes: [] }),
  }),
}));

function mountNotice(ac: number | null) {
  return mount(AcCalculatedNotice, {
    props: { member: { id: "pm-1", ac } as PartyMember },
    global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
  });
}

describe("AcCalculatedNotice", () => {
  beforeEach(() => {
    update.mockClear();
    ready.value = true;
    total.value = 11;
  });

  it("says what changed when the old number differs", () => {
    const w = mountNotice(17);
    expect(w.text()).toContain("11 (was 17)");
    expect(w.text()).toContain("Equip your armor and shield");
    expect(update).not.toHaveBeenCalled();
  });

  it("Got it clears the old number", async () => {
    const w = mountNotice(17);
    const got = w.findAll("button").find((b) => b.text() === "Got it");
    await got!.trigger("click");
    expect(update).toHaveBeenCalledWith({ id: "pm-1", update: { ac: null } });
  });

  it("clears silently when the numbers already agree", () => {
    const w = mountNotice(11);
    expect(w.find("[data-testid=ac-calculated-notice]").exists()).toBe(false);
    expect(update).toHaveBeenCalledWith({ id: "pm-1", update: { ac: null } });
  });

  it("shows nothing and writes nothing when there is no old number", () => {
    const w = mountNotice(null);
    expect(w.find("[data-testid=ac-calculated-notice]").exists()).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("waits for the gear before comparing", () => {
    ready.value = false;
    const w = mountNotice(17);
    expect(w.find("[data-testid=ac-calculated-notice]").exists()).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
