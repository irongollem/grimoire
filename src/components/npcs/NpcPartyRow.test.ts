import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import NpcPartyRow from "./NpcPartyRow.vue";
import type { Npc, NpcPcNote } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), remove: vi.fn() }));

vi.mock("@/composables/npcs/useNpcPcNotes", () => ({
  useUpsertNpcPcNote: () => ({ mutateAsync: mocks.upsert }),
  useDeleteNpcPcNote: () => ({ mutateAsync: mocks.remove }),
}));

// A plain textarea stands in for the Tiptap editor, which needs a real DOM.
const EditorStub = defineComponent({
  props: { modelValue: { type: String, default: null } },
  emits: ["update:modelValue"],
  template: '<textarea data-testid="editor" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
});

const npc = { id: "npc-1", name: "Maera" } as Npc;
const member = { id: "pm-1", name: "Wren Ashdown", class: "Wizard", level: 5, portrait_url: null } as PartyMember;

function mountRow(props: { shared?: boolean; metAt?: string | null; note?: NpcPcNote | null } = {}) {
  return mount(NpcPartyRow, {
    props: { npc, member, shared: false, ...props },
    global: { stubs: { RichTextEditor: EditorStub, FocalImage: true } },
  });
}

const thisYearOnFourthOctober = new Date(new Date().getFullYear(), 9, 4, 12).toISOString();

describe("NpcPartyRow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.upsert.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("shows a shared character's row at full strength with a Shared toggle", () => {
    const row = mountRow({ shared: true });
    expect(row.text()).toContain("Shared");
    expect(row.get('[data-testid="party-row-identity"]').classes()).not.toContain("opacity-60");
    expect(row.text()).toContain("Wizard · Level 5");
  });

  it("dims an unshared row and offers Share", () => {
    const row = mountRow({ shared: false });
    expect(row.get('[data-testid="party-row-identity"]').classes()).toContain("opacity-60");
    expect(row.findAll("button").some((b) => b.text() === "Share")).toBe(true);
  });

  it("emits toggle from the share button", async () => {
    const row = mountRow();
    await row.findAll("button").find((b) => b.text() === "Share")!.trigger("click");
    expect(row.emitted("toggle")).toHaveLength(1);
  });

  it("says Not met, or when they met", () => {
    expect(mountRow({ metAt: null }).text()).toContain("Not met");
    expect(mountRow({ metAt: thisYearOnFourthOctober }).text()).toContain("Met · 4 October");
  });

  it("adds the year to a meeting from another year", () => {
    expect(mountRow({ metAt: "2024-10-04T12:00:00Z" }).text()).toContain("Met · 4 October 2024");
  });

  it("offers a first-name connection button that opens the editor", async () => {
    const row = mountRow();
    expect(row.find('[data-testid="editor"]').exists()).toBe(false);
    await row.findAll("button").find((b) => b.text() === "+ Wren's connection")!.trigger("click");
    expect(row.find('[data-testid="editor"]').exists()).toBe(true);
    expect(row.text()).toContain("Wren reads this");
  });

  it("never upserts a blank note", async () => {
    const row = mountRow();
    await row.findAll("button").find((b) => b.text() === "+ Wren's connection")!.trigger("click");
    await row.get("select").setValue("rival");
    await vi.advanceTimersByTimeAsync(11_000);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("saves what the DM writes once they pause", async () => {
    const row = mountRow();
    await row.findAll("button").find((b) => b.text() === "+ Wren's connection")!.trigger("click");
    await row.get('[data-testid="editor"]').setValue("Owes Wren a life debt");
    await vi.advanceTimersByTimeAsync(2_500);
    await flushPromises();
    expect(mocks.upsert).toHaveBeenCalledWith({
      partyMemberId: "pm-1",
      relationshipType: "contact",
      notes: "Owes Wren a life debt",
    });
  });

  it("deletes the row when an existing note is cleared", async () => {
    const note = { id: "note-1", party_member_id: "pm-1", relationship_type: "ally", notes: "Old friend" } as NpcPcNote;
    const row = mountRow({ note });
    await row.get('[data-testid="editor"]').setValue("");
    await vi.advanceTimersByTimeAsync(2_500);
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith("note-1");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
