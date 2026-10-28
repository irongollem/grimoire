import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import type { Connection } from "@/types/connections.types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  toastError: vi.fn(),
}));
const headed = ref(false);
const pending = ref(false);

vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: mocks.create, isPending: pending }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useFactionHeaded: () => headed,
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, success: vi.fn(), fromError: (_e: unknown, f: string) => f }),
}));

import AddConnectionDialog from "./AddConnectionDialog.vue";

type Picked = { kind: string; id: string; name: string };
const PickerStub = defineComponent({
  props: { subject: { type: Object, default: null } },
  emits: ["pick"],
  setup(_p, { emit }) {
    const pick = (p: Picked) => () => emit("pick", p);
    return () => h("div", [
      h("button", { "data-pick": "harl", onClick: pick({ kind: "npc", id: "n2", name: "Harl the Toll-man" }) }, "Harl"),
      h("button", { "data-pick": "thane", onClick: pick({ kind: "faction", id: "f1", name: "House Thane" }) }, "Thane"),
      h("button", { "data-pick": "home", onClick: pick({ kind: "location", id: "l2", name: "Drover's Rest" }) }, "Rest"),
    ]);
  },
});

function conn(over: Partial<Connection>): Connection {
  return {
    source: "link", row_id: "r", type: "rival", outward: true, other_kind: "npc", other_id: "n2", other_name: "Harl the Toll-man",
    other_image: null, note: "", told: "", player_visible_to: [], ai_provenance: null, role: null, status: null, ...over,
  };
}

function render(connections: Connection[] = []) {
  return mount(AddConnectionDialog, {
    props: { open: true, subject: { kind: "npc", id: "me" }, subjectName: "Brenna Ashe", connections },
    global: {
      stubs: {
        AppModal: { template: "<div><slot /></div>" },
        ModalHeader: true,
        WorldEntityPicker: PickerStub,
        AddConnectionKinNote: true,
        AddRelativeDialog: { props: ["initialRelation", "subject"], template: "<div data-testid='relative' :data-relation='initialRelation' />" },
        AudienceRevealControl: { emits: ["change"], template: "<button data-testid='who-knows' @click=\"$emit('change', ['u1'])\" />" },
      },
    },
  });
}

const choiceButton = (w: ReturnType<typeof render>, label: string) =>
  w.findAll("[data-choice]").find((b) => b.text() === label);

beforeEach(() => {
  mocks.create.mockReset();
  mocks.toastError.mockReset();
  headed.value = false;
  pending.value = false;
});

describe("AddConnectionDialog", () => {
  it("asks for someone first and keeps Add disabled", () => {
    const w = render();
    expect(w.text()).toContain("Pick who or what Brenna Ashe is tied to");
    expect(w.findAll("button").find((b) => b.text() === "Add connection")?.attributes("disabled")).toBeDefined();
  });

  it("offers common types as chips, the rest under more…, and reads the sentence both ways", async () => {
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    expect(choiceButton(w, "friend of")).toBeDefined();
    expect(choiceButton(w, "chosen family of")).toBeUndefined();
    await w.get("[data-testid='more-types']").trigger("click");
    expect(choiceButton(w, "chosen family of")).toBeDefined();

    await choiceButton(w, "owes")!.trigger("click");
    const sentence = w.get("[data-testid='sentence']").text();
    expect(sentence).toContain("Brenna Ashe owes Harl the Toll-man");
    expect(sentence).toContain("and on Harl the Toll-man’s sheet: creditor of Brenna Ashe");
  });

  it("says a second type is a second link when the pair is already tied", async () => {
    const w = render([conn({})]);
    await w.get("[data-pick='harl']").trigger("click");
    expect(w.get("[data-testid='already']").text()).toContain("rival of");
  });

  it("writes a link with its note, told line and nobody who knows", async () => {
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    await choiceButton(w, "friend of")!.trigger("click");
    const inputs = w.findAll("input[type='text']");
    await inputs[0]!.setValue("owes her a ferry fare");
    await inputs[1]!.setValue("She ferried you for free.");
    await w.findAll("button").find((b) => b.text() === "Add connection")!.trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const call = mocks.create.mock.calls[0]![0];
    expect(call).toMatchObject({
      subject: { kind: "npc", id: "me" },
      other: { kind: "npc", id: "n2" },
      choice: { key: "friend" },
      note: "owes her a ferry fare",
      told: "She ferried you for free.",
    });
    expect(call.playerVisibleTo).toBeUndefined();
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("offers a membership its roles, without the head roles when the faction has a head", async () => {
    headed.value = true;
    const w = render();
    await w.get("[data-pick='thane']").trigger("click");
    await choiceButton(w, "member of")!.trigger("click");
    const roles = w.findAll("select option").map((o) => o.text());
    expect(roles).toContain("Officer");
    expect(roles).not.toContain("Leader");
    expect(w.text()).toContain("already has a head");
    await w.findAll("[aria-label='Role'] button").find((b) => b.text() === "Officer")!.trigger("click");
    await w.findAll("button").find((b) => b.text() === "Add connection")!.trigger("click");
    await flushPromises();
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ choice: { key: "member_of", home: "membership" }, role: "Officer" });
    expect(mocks.create.mock.calls[0]![0].note).toBeUndefined();
  });

  it("says what a one-valued record replaces", async () => {
    const w = render([conn({ source: "npc_home", other_kind: "location", other_id: "l1", other_name: "Thane's Crossing", type: "lives_in" })]);
    await w.get("[data-pick='home']").trigger("click");
    await choiceButton(w, "lives in")!.trigger("click");
    expect(w.get("[data-testid='replaces']").text()).toBe("Moves Brenna Ashe’s home from Thane's Crossing to Drover's Rest.");
  });

  it("sends kin to the Add relative dialog instead of writing it", async () => {
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    await w.get("[data-testid='more-types']").trigger("click");
    await choiceButton(w, "sibling of")!.trigger("click");
    await w.findAll("button").find((b) => b.text() === "Add in Family")!.trigger("click");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(w.emitted("close")).toHaveLength(1);
    expect(w.get("[data-testid='relative']").attributes("data-relation")).toBe("sibling");
  });

  it("reports a failed write and stays open", async () => {
    mocks.create.mockRejectedValue(new Error("nope"));
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    await choiceButton(w, "friend of")!.trigger("click");
    await w.findAll("button").find((b) => b.text() === "Add connection")!.trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalled();
    expect(w.emitted("close")).toBeUndefined();
  });

  it("trims the note and the told line, and leaves a blank one out", async () => {
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    await choiceButton(w, "friend of")!.trigger("click");
    const inputs = w.findAll("input[type='text']");
    await inputs[0]!.setValue("   ");
    await inputs[1]!.setValue("  She ferried you.  ");
    await w.findAll("button").find((b) => b.text() === "Add connection")!.trigger("click");
    await flushPromises();
    const call = mocks.create.mock.calls[0]![0];
    expect(call.note).toBeUndefined();
    expect(call.told).toBe("She ferried you.");
  });

  it("writes who knows when the DM chose someone, and nobody otherwise", async () => {
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    await choiceButton(w, "friend of")!.trigger("click");
    await w.get("[data-testid='who-knows']").trigger("click");
    await w.findAll("button").find((b) => b.text() === "Add connection")!.trigger("click");
    await flushPromises();
    expect(mocks.create.mock.calls[0]![0].playerVisibleTo).toEqual(["u1"]);
  });

  it("forgets the last pick when the dialog opens again", async () => {
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    await choiceButton(w, "friend of")!.trigger("click");
    await w.setProps({ open: false });
    await w.setProps({ open: true });
    expect(w.text()).toContain("Pick who or what Brenna Ashe is tied to");
    expect(w.find("[data-testid='sentence']").exists()).toBe(false);
  });

  it("clears the chosen type when the DM picks someone else", async () => {
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    await choiceButton(w, "friend of")!.trigger("click");
    await w.get("[data-pick='thane']").trigger("click");
    expect(w.find("[data-testid='sentence']").exists()).toBe(false);
    expect(w.findAll("button").find((b) => b.text() === "Add connection")?.attributes("disabled")).toBeDefined();
  });

  it("keeps Add disabled while a write is in flight", async () => {
    const w = render();
    await w.get("[data-pick='harl']").trigger("click");
    await choiceButton(w, "friend of")!.trigger("click");
    pending.value = true;
    await w.vm.$nextTick();
    expect(w.findAll("button").find((b) => b.text() === "Add connection")?.attributes("disabled")).toBeDefined();
  });

  it("only counts ties to the same person as already tied", async () => {
    const w = render([conn({ other_id: "n3", other_name: "Someone else" })]);
    await w.get("[data-pick='harl']").trigger("click");
    expect(w.find("[data-testid='already']").exists()).toBe(false);
  });

  it("falls back to Member when the role chosen is no longer offered", async () => {
    const w = render();
    await w.get("[data-pick='thane']").trigger("click");
    await choiceButton(w, "member of")!.trigger("click");
    await w.findAll("[aria-label='Role'] button").find((b) => b.text() === "Leader")!.trigger("click");
    headed.value = true;
    await w.vm.$nextTick();
    await w.findAll("button").find((b) => b.text() === "Add connection")!.trigger("click");
    await flushPromises();
    expect(mocks.create.mock.calls[0]![0].role).toBe("Member");
  });

  it("does not say it moves a home that already points at the one picked", async () => {
    const w = render([conn({ source: "npc_home", other_kind: "location", other_id: "l2", other_name: "Drover's Rest", type: "lives_in" })]);
    await w.get("[data-pick='home']").trigger("click");
    await choiceButton(w, "lives in")!.trigger("click");
    expect(w.find("[data-testid='replaces']").exists()).toBe(false);
  });
});
