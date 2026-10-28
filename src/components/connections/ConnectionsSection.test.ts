import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { Connection } from "@/types/connections.types";

const mocks = vi.hoisted(() => ({
  retype: vi.fn(),
  remove: vi.fn(),
  updateLink: vi.fn(),
  audience: vi.fn(),
  npcRole: vi.fn(),
  pcRole: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  push: vi.fn(),
  headed: { value: false },
  loading: { value: false },
}));
const rows = ref<Connection[]>([]);

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/connections/useConnections", () => ({
  useConnections: () => ({ data: rows, isLoading: ref(mocks.loading.value), isError: ref(false) }),
  useRetypeConnection: () => ({ mutateAsync: mocks.retype }),
  useRemoveConnection: () => ({ mutateAsync: mocks.remove }),
  useUpdateLink: () => ({ mutateAsync: mocks.updateLink }),
  useUpdateTieAudience: () => ({ mutateAsync: mocks.audience }),
  useCreateConnection: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useFactionHeaded: () => ({ get value() { return mocks.headed.value; } }),
  useUpdateFactionNpcRole: () => ({ mutateAsync: mocks.npcRole }),
  useUpdateFactionPartyMemberRole: () => ({ mutateAsync: mocks.pcRole }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, fromError: (_e: unknown, f: string) => f }),
}));

import ConnectionsSection from "./ConnectionsSection.vue";

function conn(over: Partial<Connection>): Connection {
  return {
    source: "link",
    row_id: "r1",
    type: "rival",
    outward: true,
    other_kind: "npc",
    other_id: "n1",
    other_name: "Harl the Toll-man",
    other_image: null,
    note: "wants the crossing",
    told: "",
    player_visible_to: [],
    ai_provenance: null,
    role: null,
    status: null,
    ...over,
  };
}

function render(subject: { kind: "npc" | "location" | "faction"; id: string } = { kind: "npc", id: "me" }) {
  return mount(ConnectionsSection, {
    attachTo: document.body,
    props: { subject, subjectName: "Brenna Ashe" },
    global: {
      stubs: {
        ConnectionSuggestions: true,
        AddConnectionDialog: true,
        AudienceRevealControl: { template: "<span data-testid='who-knows' />" },
        RouterLink: { props: ["to"], template: "<a :data-to=\"to\"><slot /></a>" },
      },
    },
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === "function" && m.mockReset());
  mocks.headed.value = false;
  mocks.loading.value = false;
  rows.value = [];
});

describe("ConnectionsSection", () => {
  it("says so when there is nothing yet", () => {
    expect(render().text()).toContain("No connections yet.");
  });

  it("lists rows grouped in the one order, with the type word and the DM note", () => {
    rows.value = [
      conn({ row_id: "i", other_kind: "item", other_id: "i1", other_name: "The Ferry Bell", type: "seeks", note: "" }),
      conn({}),
    ];
    const w = render();
    const groups = w.findAll("[data-group]").map((g) => g.attributes("data-group"));
    expect(groups).toEqual(["people", "items"]);
    expect(w.text()).toContain("Harl the Toll-man");
    expect(w.text()).toContain("wants the crossing");
    expect(w.find("[data-testid='type-word']").text()).toBe("rival of");
  });

  it("marks a record with its home and offers the role in place for a membership", async () => {
    rows.value = [
      conn({ source: "membership", row_id: "m1", other_kind: "faction", other_id: "f1", other_name: "House Thane", type: "member_of", role: "Heir", note: null, told: null, player_visible_to: null }),
    ];
    const w = render();
    expect(w.get("[data-testid='home-marker']").text()).toBe("membership");
    expect(w.find("[data-testid='who-knows']").exists()).toBe(false);
    const select = w.get("[data-testid='role-select']");
    await select.setValue("Officer");
    expect(mocks.npcRole).toHaveBeenCalledWith({ id: "m1", role: "Officer", faction_id: "f1", npc_id: "me" });
  });

  it("keeps the head roles out of the role list when the faction has a head", () => {
    mocks.headed.value = true;
    rows.value = [
      conn({ source: "membership", row_id: "m1", other_kind: "faction", other_id: "f1", type: "member_of", role: "Member", note: null, told: null, player_visible_to: null }),
    ];
    const options = render().findAll("[data-testid='role-select'] option").map((o) => o.text());
    expect(options).not.toContain("Leader");
    expect(options).toContain("Officer");
  });

  it("shows the who-knows control on a link only", () => {
    rows.value = [conn({})];
    expect(render().find("[data-testid='who-knows']").exists()).toBe(true);
  });

  it("gives a membership the who-knows control too, when the read carries its audience", () => {
    rows.value = [
      conn({ source: "membership", row_id: "m1", other_kind: "faction", other_id: "f1", type: "member_of", role: "Member", note: null, told: null, player_visible_to: [] }),
    ];
    expect(render().find("[data-testid='who-knows']").exists()).toBe(true);
  });

  it("removes a connection from its menu", async () => {
    rows.value = [conn({})];
    const w = render();
    await w.get("button[aria-label^='More actions for Harl']").trigger("click");
    const remove = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Remove connection");
    remove?.click();
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith(expect.objectContaining({ subject: { kind: "npc", id: "me" } }));
  });

  it("opens the note and told editor from the menu", async () => {
    rows.value = [conn({})];
    const w = render();
    await w.get("button[aria-label^='More actions for Harl']").trigger("click");
    [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Edit note and told")?.click();
    await flushPromises();
    expect(w.find("[data-testid='connection-notes-editor']").exists()).toBe(true);
  });

  it("changes a type in place through the picker", async () => {
    rows.value = [conn({})];
    const w = render();
    await w.get("[data-testid='type-word']").trigger("click");
    [...document.body.querySelectorAll<HTMLElement>("[data-type-option]")].find((o) => o.textContent?.trim() === "enemy of")?.click();
    await flushPromises();
    expect(mocks.retype).toHaveBeenCalledWith(expect.objectContaining({ choice: expect.objectContaining({ key: "enemy" }) }));
  });

  it("folds a place's many residents into one line", () => {
    rows.value = Array.from({ length: 8 }, (_, i) =>
      conn({ source: "npc_home", row_id: `n${i}`, other_id: `n${i}`, other_name: `Resident ${i}`, type: "lives_in", outward: false, note: null, told: null, player_visible_to: null }),
    );
    const w = render({ kind: "location", id: "L" });
    expect(w.get("[data-testid='connections-summary']").text()).toContain("8 people live here");
    expect(w.text()).toContain("People in the Area");
    expect(w.text()).not.toContain("Resident 3");
  });

  it("names a membership that is no longer active, and says nothing of an active one", () => {
    const base = { source: "membership" as const, other_kind: "faction" as const, other_id: "f1", type: "member_of", role: "Member", note: null, told: null, player_visible_to: null };
    rows.value = [conn({ ...base, row_id: "m1", other_name: "House Thane", status: "Defected" }), conn({ ...base, row_id: "m2", other_id: "f2", other_name: "Dock Wardens", status: "Active" })];
    const w = render();
    const [defected, active] = w.findAll("li[data-source='membership']");
    expect(defected!.text()).toContain("Defected");
    expect(active!.text()).not.toContain("Active");
  });

  it("writes a character's role through the party-member roster, not the NPC one", async () => {
    rows.value = [
      conn({ source: "membership", row_id: "m1", other_kind: "faction", other_id: "f1", type: "member_of", role: "Member", note: null, told: null, player_visible_to: null }),
    ];
    const w = mount(ConnectionsSection, {
      props: { subject: { kind: "party_member", id: "pc1" }, subjectName: "Tamsin" },
      global: { stubs: { ConnectionSuggestions: true, AddConnectionDialog: true, RouterLink: true, AudienceRevealControl: true } },
    });
    await w.get("[data-testid='role-select']").setValue("Officer");
    expect(mocks.pcRole).toHaveBeenCalledWith({ id: "m1", role: "Officer", faction_id: "f1", party_member_id: "pc1" });
    expect(mocks.npcRole).not.toHaveBeenCalled();
  });

  it("opens the faction a membership is kept in from the menu, and offers no such entry on a link", async () => {
    rows.value = [
      conn({ source: "membership", row_id: "m1", other_kind: "faction", other_id: "f1", other_name: "House Thane", type: "member_of", role: "Member", note: null, told: null, player_visible_to: null }),
    ];
    const w = render();
    await w.get("button[aria-label^='More actions for House Thane']").trigger("click");
    const labels = () => [...document.body.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels()).toContain("Open the membership record");
    [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Open the membership record")?.click();
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith("/factions/f1");
  });

  it("links a non-NPC row to its own sheet and reads the told line", () => {
    rows.value = [conn({ other_kind: "faction", other_id: "f1", other_name: "House Thane", told: "They hold the weir." })];
    const w = render();
    expect(w.get("a[data-to='/factions/f1']").text()).toContain("House Thane");
    expect(w.text()).toContain("Told: “They hold the weir.”");
  });

  it("leaves the told line out when there is none", () => {
    rows.value = [conn({ told: "" })];
    expect(render().text()).not.toContain("Told:");
  });

  it("does not offer to change the type of a quest's tie", () => {
    rows.value = [conn({ source: "quest", row_id: "q1", other_kind: "quest", other_id: "q1", other_name: "The Ferry Bell", type: "involved_in", note: null, told: null, player_visible_to: null })];
    const w = render();
    expect(w.find("[data-testid='type-word']").exists()).toBe(false);
    expect(w.find("[data-testid='type-word-static']").exists()).toBe(true);
  });

  it("tells the DM a retyped tie became kin", async () => {
    rows.value = [conn({})];
    mocks.retype.mockResolvedValue(undefined);
    const w = render();
    await w.get("[data-testid='type-word']").trigger("click");
    document.body.querySelector<HTMLElement>("[data-testid='type-more']")?.click();
    await flushPromises();
    [...document.body.querySelectorAll<HTMLElement>("[data-type-option]")].find((o) => o.textContent?.trim() === "sibling of")?.click();
    await flushPromises();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Harl the Toll-man is now kin, under Family.");
  });

  it("does not say a one-valued record replaces itself", async () => {
    rows.value = [conn({ source: "npc_home", row_id: "me", other_kind: "location", other_id: "l1", other_name: "Thane's Crossing", type: "lives_in", note: null, told: null, player_visible_to: null })];
    const w = render();
    await w.get("[data-testid='type-word']").trigger("click");
    const notes = [...document.body.querySelectorAll("[data-testid='type-note']")].map((n) => n.textContent);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => n?.includes("Replaces"))).toBe(false);
  });

  it("does not offer a place's resident the record a place cannot hold twice", async () => {
    // A resident's row on a place's sheet: the place is the `to` end, so picking another type never replaces its neighbour.
    rows.value = ["a", "b"].map((id) =>
      conn({ source: "npc_home", row_id: id, other_id: id, other_name: `Resident ${id}`, type: "lives_in", outward: false, note: null, told: null, player_visible_to: null }),
    );
    const w = render({ kind: "location", id: "L" });
    await w.get("[data-testid='type-word']").trigger("click");
    const notes = [...document.body.querySelectorAll("[data-testid='type-note']")].map((n) => n.textContent);
    expect(notes.some((n) => n?.includes("Replaces"))).toBe(false);
  });
});
