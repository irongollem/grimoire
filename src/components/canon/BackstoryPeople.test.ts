import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { Connection } from "@/types/connections.types";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ start: vi.fn(), discard: vi.fn() }));
const ties = vi.hoisted(() => ({ byKind: {} as Record<string, unknown[]> }));
vi.mock("@/composables/connections/useConnections", () => ({ useConnections: (kind: string) => ({ data: computed(() => ties.byKind[kind] ?? []) }) }));
vi.mock("@/composables/canon/useNewBackstoryNpc", () => ({ useNewBackstoryNpc: () => ({ start: mocks.start, creating: ref(false), discardPending: mocks.discard }) }));

import BackstoryPeople from "./BackstoryPeople.vue";

const member = { id: "m1", name: "Tansy" } as unknown as PartyMember;
const entry = canonEntry({ id: "b1", part: "backstory", party_member_id: "m1" });
const tie = (over: Partial<Connection>) => ({ row_id: "r", source: "link", type: "friend", outward: true, other_kind: "npc", other_id: "n1", other_name: "Maren", ...over }) as Connection;
const link = { props: ["to"], template: "<a :data-to='JSON.stringify(to)'><slot /></a>" };
const mountPeople = () => mount(BackstoryPeople, { props: { member, entry }, global: { stubs: { RouterLink: link, TypeChoiceChips: { props: ["choices"], emits: ["pick"], template: "<button data-testid='chip' @click=\"$emit('pick', choices[0])\">chip</button>" } } } });

describe("BackstoryPeople", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    mocks.discard.mockReset();
    ties.byKind = {};
  });

  // Bug caught (#1258 item 4): the people drawn as an editor (or as links to nowhere) instead of a read-only list of
  // links to each NPC, with one way to edit them on the character.
  it("lists the character's NPCs as links to their sheets, with one link to edit on the character", () => {
    ties.byKind = { party_member: [tie({ other_id: "n1", other_name: "Maren" }), tie({ row_id: "x", other_kind: "location", other_id: "mill", other_name: "Mill" })] };
    const w = mountPeople();
    const people = w.findAll("[data-testid=backstory-person]");
    expect(people.map((p) => p.text())).toEqual(["Marenfriend of"]);
    expect(people[0]!.find("a").attributes("data-to")).toBe(JSON.stringify({ name: "npc-detail", params: { id: "n1" } }));
    expect(w.find("[data-testid=edit-on-character]").exists()).toBe(true);
    expect(w.find("input[type=checkbox], [data-testid=connections-block]").exists()).toBe(false);
  });

  // Bug caught: a person made with no relationship (tied to the backstory only) missing from the list.
  it("also lists an NPC the backstory is about when the character has no tie to them, once", () => {
    ties.byKind = {
      party_member: [tie({ other_id: "n1", other_name: "Maren" })],
      canon: [tie({ type: "about", other_id: "n1", other_name: "Maren" }), tie({ row_id: "a2", type: "about", other_id: "n2", other_name: "Harl" })],
    };
    expect(mountPeople().findAll("[data-testid=backstory-person]").map((p) => p.find("a").text())).toEqual(["Maren", "Harl"]);
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
    expect(mocks.start).toHaveBeenCalledWith("b1", "Tansy", "m1", { name: "  Harl ", relationship: null });
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
    expect(mocks.start.mock.calls[0]![3].relationship).not.toBeNull();
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
