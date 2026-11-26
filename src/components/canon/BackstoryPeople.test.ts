import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ start: vi.fn(), discard: vi.fn() }));
vi.mock("@/composables/canon/useNewBackstoryNpc", () => ({ useNewBackstoryNpc: () => ({ start: mocks.start, creating: ref(false), discardPending: mocks.discard }) }));

import BackstoryPeople from "./BackstoryPeople.vue";

const member = { id: "m1", name: "Tansy" } as unknown as PartyMember;
const link = { props: ["to"], template: "<a :data-to='JSON.stringify(to)'><slot /></a>" };
const mountPeople = () => mount(BackstoryPeople, { props: { member }, global: { stubs: { RouterLink: link, TypeChoiceChips: { props: ["choices"], emits: ["pick"], template: "<button data-testid='chip' @click=\"$emit('pick', choices[0])\">chip</button>" } } } });

describe("BackstoryPeople", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    mocks.discard.mockReset();
  });

  // Bug caught (#1279 item 12): a second list of the character's people here, beside the Connections block that holds
  // the same ties, so a person read twice and edited from neither.
  it("lists no people of its own: the character's Connections block is the one list", () => {
    const w = mountPeople();
    expect(w.find("[data-testid=backstory-people-list]").exists()).toBe(false);
    expect(w.find("[data-testid=edit-on-character]").exists()).toBe(false);
  });

  // Bug caught (#1258 item 25): Create enabled with no name, so a nameless NPC could be made.
  it("keeps Create off until there is a name, and creates nothing on submit without one", async () => {
    const w = mountPeople();
    await w.find("[data-testid=new-npc]").trigger("click");
    expect(w.find("[data-testid=create-npc]").attributes("disabled")).toBeDefined();
    await w.find("[data-testid=new-npc-setup]").trigger("submit");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  // Bug caught: the form navigating away to the NPC (the old behaviour) instead of staying and offering "Open sheet".
  it("creates with the name and optional relationship, stays here and offers Open sheet", async () => {
    mocks.start.mockResolvedValue({ id: "n9", name: "Harl" });
    const w = mountPeople();
    await w.find("[data-testid=new-npc]").trigger("click");
    await w.find("[data-testid=new-npc-name]").setValue("  Harl ");
    await w.find("[data-testid=new-npc-setup]").trigger("submit");
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledWith("Tansy", "m1", { name: "  Harl ", relationship: null });
    expect(w.find("[data-testid=new-npc-setup]").exists()).toBe(false);
    expect(w.find("[data-testid=new-npc-made]").text()).toContain("Harl");
    expect(w.find("[data-testid=open-sheet]").exists()).toBe(true);
  });

  it("passes the relationship when one is picked, and keeps the form open when the create fails", async () => {
    mocks.start.mockResolvedValue(null);
    const w = mountPeople();
    await w.find("[data-testid=new-npc]").trigger("click");
    await w.find("[data-testid=new-npc-name]").setValue("Harl");
    await w.find("[data-testid=chip]").trigger("click");
    await w.find("[data-testid=new-npc-setup]").trigger("submit");
    await flushPromises();
    expect(mocks.start.mock.calls[0]![2].relationship).not.toBeNull();
    expect(w.find("[data-testid=new-npc-setup]").exists()).toBe(true);
    expect(w.find("[data-testid=new-npc-made]").exists()).toBe(false);
  });

  // Bug caught: Cancel leaving a half-made NPC to be retried by the next form.
  it("discards a pending person on Cancel", async () => {
    const w = mountPeople();
    await w.find("[data-testid=new-npc]").trigger("click");
    await w.findAll("button").find((b) => b.text() === "Cancel")!.trigger("click");
    expect(mocks.discard).toHaveBeenCalled();
    expect(w.find("[data-testid=new-npc-setup]").exists()).toBe(false);
  });
});
