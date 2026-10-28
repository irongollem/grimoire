import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddRelativeDialog from "./AddRelativeDialog.vue";
import { edge, k, person, sourceOf } from "./testGraph";

const mocks = vi.hoisted(() => ({
  dm: null as unknown,
  created: [] as Record<string, unknown>[],
  updated: [] as { id: string; patch: Record<string, unknown> }[],
  push: vi.fn(),
  failAt: 0,
  toastError: vi.fn(),
  createNpc: vi.fn(),
  ai: true,
  rejectWith: null as unknown,
}));

vi.mock("@/composables/kinship/useKinGraph", () => ({ useDmKinGraph: () => mocks.dm }));
vi.mock("@/composables/kinship/useKinLinks", () => ({
  useCreateKinLink: () => ({
    mutateAsync: async (row: Record<string, unknown>) => {
      if (mocks.rejectWith) throw mocks.rejectWith;
      if (mocks.failAt && mocks.created.length + 1 === mocks.failAt) throw new Error("boom");
      mocks.created.push(row);
      return { id: `new-${mocks.created.length}`, ...row };
    },
  }),
  useUpdateKinLink: () => ({
    mutateAsync: async (arg: { id: string; patch: Record<string, unknown> }) => {
      mocks.updated.push(arg);
      return { id: arg.id, ...arg.patch };
    },
  }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useCreateNpc: () => ({ mutateAsync: mocks.createNpc }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: mocks.toastError, fromError: String }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ todayYear: 1495, get isAiEnabled() { return mocks.ai; } }) }));
vi.mock("@/composables/kinship/useKinClock", async () => {
  const { computed } = await import("vue");
  const { testClock } = await import("./testGraph");
  return { useKinClock: () => computed(() => testClock()) };
});

const people = [
  person("old", "Old Bren", 1428),
  person("mum", "Maera", 1431),
  person("me", "Brenna", 1459),
  person("bro", "Tomas", 1462),
  person("hub", "Corwin", 1456),
  person("kid", "Wren", 1483),
  person("pip", "Pip", 1488),
  person("hale", "Hale", null),
];
// Brenna: daughter of Maera and Old Bren's other child Tomas is her sibling; Corwin is her only spouse; Wren her child.
const edges = [
  edge("1", "mum", "me", "parent"),
  edge("2", "mum", "bro", "parent"),
  edge("3", "me", "hub", "spouse"),
  edge("4", "me", "kid", "parent"),
];

function mountDialog(subject = k("me"), extra: { initialRelation?: "parent" | "child" | "spouse" | "sibling" } = {}) {
  return mount(AddRelativeDialog, { props: { subject, open: true, ...extra }, attachTo: document.body, global: { stubs: { transition: false } } });
}
const body = () => document.body;
const buttonWith = (text: string) => [...body().querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text));

async function setRelation(label: string) {
  buttonWith(label)!.click();
  await flushPromises();
}
async function pick(query: string, name: string) {
  const input = body().querySelector<HTMLInputElement>("input[placeholder^='Search']")!;
  input.value = query;
  input.dispatchEvent(new Event("input"));
  await flushPromises();
  [...body().querySelectorAll("ul[data-slip] button")].find((b) => b.textContent?.includes(name))?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flushPromises();
}
async function save(label: string) {
  buttonWith(label)!.click();
  await flushPromises();
}

beforeEach(() => {
  mocks.dm = sourceOf(people, edges);
  mocks.created.length = 0;
  mocks.updated.length = 0;
  mocks.push.mockReset();
  mocks.failAt = 0;
  mocks.toastError.mockReset();
  mocks.createNpc.mockReset();
  mocks.ai = true;
  mocks.rejectWith = null;
  document.body.innerHTML = "";
});

describe("AddRelativeDialog", () => {
  it("writes 'Parent of' with the subject as the parent end", async () => {
    const w = mountDialog();
    await setRelation("Parent of");
    await pick("pip", "Pip");
    // Brenna has one spouse, so the second-parent box is offered and ticked; tick it off to test the plain row.
    body().querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
    await flushPromises();
    await save("Add child");
    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0]).toMatchObject({ kind: "parent", from_npc_id: "me", to_npc_id: "pip" });
    expect(w.emitted("added")).toHaveLength(1);
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("writes 'Child of' the other way round", async () => {
    mountDialog();
    await setRelation("Child of");
    await pick("old", "Old Bren");
    await save("Add parent");
    expect(mocks.created[0]).toMatchObject({ kind: "parent", from_npc_id: "old", to_npc_id: "me" });
  });

  it("writes a second parent link for the only spouse by default", async () => {
    mountDialog();
    await setRelation("Parent of");
    await pick("pip", "Pip");
    await save("Add child");
    expect(mocks.created).toHaveLength(2);
    expect(mocks.created[0]).toMatchObject({ from_npc_id: "me", to_npc_id: "pip" });
    expect(mocks.created[1]).toMatchObject({ kind: "parent", from_npc_id: "hub", to_npc_id: "pip" });
  });

  it("carries the parent role and adoptive flag", async () => {
    mountDialog();
    await setRelation("Child of");
    await pick("old", "Old Bren");
    [...body().querySelectorAll("button")].find((b) => b.textContent?.trim() === "Father")!.click();
    [...body().querySelectorAll("input[type=checkbox]")].at(-1)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    await save("Add parent");
    expect(mocks.created[0]).toMatchObject({ parent_role: "father", adoptive: true });
  });

  it("warns when the dates disagree, and Swap flips the relation", async () => {
    mountDialog();
    await setRelation("Parent of");
    await pick("old", "Old Bren");
    const box = body().querySelector("[data-testid=verdict-dates]")!;
    expect(box.textContent).toContain("31 years after");
    expect((buttonWith("Add child") as HTMLButtonElement).disabled).toBe(true);

    buttonWith("Swap")!.click();
    await flushPromises();
    expect(body().querySelector("[data-testid=verdict-dates]")).toBeNull();
    await save("Add parent");
    expect(mocks.created[0]).toMatchObject({ from_npc_id: "old", to_npc_id: "me" });
  });

  it("lets the DM keep the dates anyway", async () => {
    mountDialog();
    await setRelation("Parent of");
    await pick("old", "Old Bren");
    buttonWith("Keep it anyway")!.click();
    await flushPromises();
    body().querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
    await flushPromises();
    await save("Add child");
    expect(mocks.created[0]).toMatchObject({ from_npc_id: "me", to_npc_id: "old" });
  });

  it("explains implied siblings and writes nothing", async () => {
    const w = mountDialog();
    await setRelation("Sibling of");
    await pick("tomas", "Tomas");
    expect(body().querySelector("[data-testid=verdict-sibling]")!.textContent).toContain("They already share Maera");
    expect((buttonWith("Add sibling") as HTMLButtonElement).disabled).toBe(true);
    buttonWith("Got it")!.click();
    await flushPromises();
    expect(mocks.created).toHaveLength(0);
    expect(w.emitted("close")).toHaveLength(1);
    expect(w.emitted("added")).toBeUndefined();
  });

  it("offers to change an existing link instead of inserting a second", async () => {
    mountDialog();
    await setRelation("Former spouse of");
    await pick("corwin", "Corwin");
    expect(body().querySelector("[data-testid=verdict-existing]")!.textContent).toContain("Corwin is already Brenna’s spouse");
    buttonWith("Change it")!.click();
    await flushPromises();
    expect(mocks.created).toHaveLength(0);
    expect(mocks.updated).toHaveLength(1);
    expect(mocks.updated[0]).toMatchObject({ id: "3", patch: { kind: "former_spouse" } });
  });

  it("drafts with AI by the inverse relation and carries the only spouse", async () => {
    const w = mountDialog();
    await setRelation("Parent of");
    const input = body().querySelector<HTMLInputElement>("input[placeholder^='Search']")!;
    input.value = "Zed";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    buttonWith("Draft a child with AI")!.click();
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({ path: "/npcs", query: { kin: "child", of: "npc:me", also: "npc:hub" } });
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("reports a partial save when the second parent link fails", async () => {
    mocks.failAt = 2;
    const w = mountDialog();
    await setRelation("Parent of");
    await pick("pip", "Pip");
    await save("Add child");
    expect(mocks.created).toHaveLength(1);
    expect(mocks.toastError).toHaveBeenCalledWith("Added Pip as Brenna’s child. Could not add Corwin as the second parent.");
    expect(w.emitted("added")).toHaveLength(1);
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("runs the checks on the second parent and says why it is skipped", async () => {
    // Corwin (1456) as parent of Old Bren (1428) is a date problem; Brenna (1459) is no better, so Swap is not in play.
    const w = mountDialog();
    await setRelation("Parent of");
    await pick("old", "Old Bren");
    buttonWith("Keep it anyway")!.click();
    await flushPromises();
    expect(body().querySelector("[data-testid=second-parent-refusal]")!.textContent).toContain(
      "Corwin will not be added as a parent: Corwin was born 28 years after Old Bren",
    );
    expect(body().querySelector("input[type=checkbox]")).not.toBeNull();
    await save("Add child");
    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0]).toMatchObject({ from_npc_id: "me", to_npc_id: "old" });
    expect(w.emitted("added")).toHaveLength(1);
  });

  it("trims the note before it is stored", async () => {
    mountDialog();
    await setRelation("Child of");
    await pick("old", "Old Bren");
    const note = body().querySelector<HTMLInputElement>("input[placeholder^='e.g.']")!;
    note.value = "  born the winter the river froze  ";
    note.dispatchEvent(new Event("input"));
    await flushPromises();
    await save("Add parent");
    expect(mocks.created[0]).toMatchObject({ note: "born the winter the river froze" });
  });

  it("carries the adoptive flag onto the second parent's link too", async () => {
    mountDialog();
    await setRelation("Parent of");
    await pick("pip", "Pip");
    [...body().querySelectorAll("input[type=checkbox]")].at(-1)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    await save("Add child");
    expect(mocks.created).toHaveLength(2);
    expect(mocks.created.map((r) => r.adoptive)).toEqual([true, true]);
  });

  it("does not offer a second parent when the subject has no single current spouse", async () => {
    mocks.dm = sourceOf(people, [...edges, edge("5", "me", "pip", "spouse")]);
    mountDialog();
    await setRelation("Parent of");
    await pick("hale", "Hale");
    await save("Add child");
    expect(mocks.created).toHaveLength(1);
  });

  it("never lists the subject as a candidate for their own relative", async () => {
    mountDialog();
    const input = body().querySelector<HTMLInputElement>("input[placeholder^='Search']")!;
    input.value = "Brenna";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    expect([...body().querySelectorAll("ul[data-slip] button")].map((b) => b.textContent)).toEqual([]);
  });

  it("starts fresh when it opens again: the relation asked for, nobody chosen, no note", async () => {
    const w = mountDialog(k("me"), { initialRelation: "sibling" });
    await setRelation("Spouse of");
    await pick("hale", "Hale");
    await w.setProps({ open: false });
    await w.setProps({ open: true });
    await flushPromises();
    expect(buttonWith("Add sibling")).toBeDefined();
    expect((buttonWith("Add sibling") as HTMLButtonElement).disabled).toBe(true);
    expect(body().querySelector("input[placeholder^='Search']")).not.toBeNull();
  });

  it("asks about the dates again when the DM picks someone else", async () => {
    mocks.dm = sourceOf([...people, person("elda", "Elda", 1400)], edges);
    mountDialog();
    await setRelation("Parent of");
    await pick("old", "Old Bren");
    buttonWith("Keep it anyway")!.click();
    await flushPromises();
    expect(body().querySelector("[data-testid=verdict-dates]")).toBeNull();
    buttonWith("Change")!.click();
    await flushPromises();
    await pick("elda", "Elda");
    expect(body().querySelector("[data-testid=verdict-dates]")!.textContent).toContain("59 years after");
  });

  it("names both shared parents of an implied sibling", async () => {
    mocks.dm = sourceOf(people, [...edges, edge("5", "mum", "hale", "parent"), edge("6", "old", "hale", "parent"), edge("7", "old", "me", "parent")]);
    mountDialog();
    await setRelation("Sibling of");
    await pick("hale", "Hale");
    expect(body().querySelector("[data-testid=verdict-sibling]")!.textContent).toMatch(/share (Maera and Old Bren|Old Bren and Maera),/);
  });

  it("says they are already linked when the database refuses a second link for the pair", async () => {
    mocks.rejectWith = Object.assign(new Error("duplicate"), { code: "23505" });
    const w = mountDialog();
    await setRelation("Sibling of");
    await pick("hale", "Hale");
    await save("Add sibling");
    expect(mocks.toastError).toHaveBeenCalledWith("They are already linked.");
    expect(w.emitted("close")).toBeUndefined();
  });

  it("creates the typed NPC and links to them", async () => {
    mocks.createNpc.mockResolvedValue({ id: "zed", name: "Zed" });
    mountDialog();
    await setRelation("Sibling of");
    const input = body().querySelector<HTMLInputElement>("input[placeholder^='Search']")!;
    input.value = "Zed";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    buttonWith("+ New NPC")!.click();
    await flushPromises();
    expect(mocks.createNpc).toHaveBeenCalledWith(expect.objectContaining({ name: "Zed", is_revealed: false, player_visible_to: [] }));
    await save("Add sibling");
    expect(mocks.created[0]).toMatchObject({ kind: "sibling", from_npc_id: "me", to_npc_id: "zed" });
  });

  it("tells the DM they hit the NPC limit, and picks nobody", async () => {
    mocks.createNpc.mockRejectedValue({ message: "quota_exceeded" });
    mountDialog();
    const input = body().querySelector<HTMLInputElement>("input[placeholder^='Search']")!;
    input.value = "Zed";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    buttonWith("+ New NPC")!.click();
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalledWith("You have reached your NPC limit on this plan.");
    expect((buttonWith("Add child") as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers no AI draft when the campaign has AI off", async () => {
    mocks.ai = false;
    mountDialog();
    await setRelation("Parent of");
    const input = body().querySelector<HTMLInputElement>("input[placeholder^='Search']")!;
    input.value = "Zed";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    expect(buttonWith("Draft a child with AI")).toBeUndefined();
  });

  it("does not carry the spouse into a draft of anything but a child", async () => {
    mountDialog();
    await setRelation("Sibling of");
    const input = body().querySelector<HTMLInputElement>("input[placeholder^='Search']")!;
    input.value = "Zed";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    buttonWith("Draft a sibling with AI")!.click();
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({ path: "/npcs", query: { kin: "sibling", of: "npc:me" } });
  });

  it("opens again with the second parent ticked", async () => {
    const w = mountDialog();
    await setRelation("Parent of");
    await pick("pip", "Pip");
    body().querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
    await flushPromises();
    await w.setProps({ open: false });
    await w.setProps({ open: true });
    await flushPromises();
    await setRelation("Parent of");
    await pick("pip", "Pip");
    await save("Add child");
    expect(mocks.created).toHaveLength(2);
  });

  it("opens again with the parent role unset and not adoptive", async () => {
    const w = mountDialog();
    await setRelation("Child of");
    await pick("old", "Old Bren");
    [...body().querySelectorAll("button")].find((b) => b.textContent?.trim() === "Father")!.click();
    [...body().querySelectorAll("input[type=checkbox]")].at(-1)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    await w.setProps({ open: false });
    await w.setProps({ open: true });
    await flushPromises();
    await setRelation("Child of");
    await pick("old", "Old Bren");
    await save("Add parent");
    expect(mocks.created[0]).toMatchObject({ parent_role: null, adoptive: false });
  });
});
