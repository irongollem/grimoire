// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PartyDeathSaves from "./PartyDeathSaves.vue";
import type { PartyMember } from "@/types/party.types";

vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }) }));

const dead = {
  id: "m1",
  name: "Karl",
  current_hp: 0,
  death_save_successes: 0,
  death_save_failures: 3,
  conditions: [],
} as unknown as PartyMember;

function mountSaves(m: PartyMember) {
  return mount(PartyDeathSaves, { props: { member: m }, global: { stubs: { SetDownDialog: true } } });
}

describe("PartyDeathSaves when dead", () => {
  it("offers Mark as fallen beside Revive, and opens the set-down dialog only when asked", async () => {
    const w = mountSaves(dead);
    expect(w.text()).toContain("Revive");
    expect(w.findComponent({ name: "SetDownDialog" }).exists()).toBe(false);
    const mark = w.findAll("button").find((b) => b.text().includes("Mark as fallen"));
    expect(mark).toBeDefined();
    await mark!.trigger("click");
    expect(w.findComponent({ name: "SetDownDialog" }).exists()).toBe(true);
  });

  it("offers neither while the character is only dying", () => {
    const w = mountSaves({ ...dead, death_save_failures: 1 } as PartyMember);
    expect(w.text()).not.toContain("Mark as fallen");
  });
});
