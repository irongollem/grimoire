import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

const mocks = vi.hoisted(() => ({ sort: vi.fn() }));
vi.mock("@/composables/notes/useNoteSorting", () => ({ useSortNote: () => ({ mutateAsync: mocks.sort, isPending: ref(false) }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([{ id: "m1", name: "Ash" }]) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

import NoteSortingRow from "./NoteSortingRow.vue";
import type { NoteToSort } from "@/lib/notes/noteSortingWrites";

/** Stand-ins that pick on a click, so a test chooses a destination without the real pickers' queries. */
const SessionPicker = defineComponent({
  props: ["modelValue"],
  emits: ["update:modelValue"],
  setup: (_p, { emit }) => () => h("button", { "data-testid": "pick-session", onClick: () => emit("update:modelValue", "s1") }),
});
const Combobox = defineComponent({
  props: ["modelValue"],
  emits: ["update:modelValue"],
  setup: (_p, { emit }) => () => h("button", { "data-testid": "pick-member", onClick: () => emit("update:modelValue", "m1") }),
});

const item = { was: "session", note: { id: "n1", title: "Night one", content: null } } as unknown as NoteToSort;

function open(kind?: string) {
  const w = mount(NoteSortingRow, {
    props: { item },
    global: { stubs: { NoteSessionPicker: SessionPicker, EntityCombobox: Combobox } },
  });
  return { w, chooseKind: async () => kind && (await w.find("select").setValue(kind)) };
}
const sortButton = (w: ReturnType<typeof open>["w"]) => w.findAll("button").find((b) => b.text() === "Sort")!;

describe("NoteSortingRow", () => {
  beforeEach(() => mocks.sort.mockReset());

  // Fails on: Sort enabled before a session is picked, writing a note into no session at all.
  it("keeps Sort off and writes nothing while a session note has no session picked", async () => {
    const { w } = open();
    expect(sortButton(w).attributes("disabled")).toBeDefined();
    await sortButton(w).trigger("click");
    expect(mocks.sort).not.toHaveBeenCalled();
  });

  it("sorts into the session once one is picked", async () => {
    const { w } = open();
    await w.find("[data-testid=pick-session]").trigger("click");
    expect(sortButton(w).attributes("disabled")).toBeUndefined();
    await sortButton(w).trigger("click");
    expect(mocks.sort).toHaveBeenCalledWith({ note: item.note, choice: { kind: "session", sessionId: "s1" } });
  });

  // Fails on: a backstory sorted onto no character.
  it("keeps Sort off for a backstory until a character is picked", async () => {
    const { w, chooseKind } = open("backstory");
    await chooseKind();
    expect(sortButton(w).attributes("disabled")).toBeDefined();
    await w.find("[data-testid=pick-member]").trigger("click");
    expect(sortButton(w).attributes("disabled")).toBeUndefined();
  });
});
