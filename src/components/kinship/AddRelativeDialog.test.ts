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
}));

vi.mock("@/composables/kinship/useKinGraph", () => ({ useDmKinGraph: () => mocks.dm }));
vi.mock("@/composables/kinship/useKinLinks", () => ({
  useCreateKinLink: () => ({
    mutateAsync: async (row: Record<string, unknown>) => {
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
vi.mock("@/composables/npcs/useNpcs", () => ({ useCreateNpc: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: mocks.toastError, fromError: String }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ todayYear: 1495, isAiEnabled: true }) }));
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

function mountDialog(subject = k("me")) {
  return mount(AddRelativeDialog, { props: { subject, open: true }, attachTo: document.body, global: { stubs: { transition: false } } });
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
});
