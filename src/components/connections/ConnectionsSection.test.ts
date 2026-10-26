import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { Connection } from "@/types/connections.types";

const mocks = vi.hoisted(() => ({
  retype: vi.fn(),
  remove: vi.fn(),
  updateLink: vi.fn(),
  npcRole: vi.fn(),
  pcRole: vi.fn(),
  toastError: vi.fn(),
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
  useCreateConnection: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useFactionHeaded: () => ({ get value() { return mocks.headed.value; } }),
  useUpdateFactionNpcRole: () => ({ mutateAsync: mocks.npcRole }),
  useUpdateFactionPartyMemberRole: () => ({ mutateAsync: mocks.pcRole }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, success: vi.fn(), fromError: (_e: unknown, f: string) => f }),
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
        RouterLink: { template: "<a><slot /></a>" },
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
});
