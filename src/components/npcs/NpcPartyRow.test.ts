import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import NpcPartyRow from "./NpcPartyRow.vue";
import type { Npc } from "@/types/npc.types";
import type { Connection } from "@/types/connections.types";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ create: vi.fn(), retype: vi.fn(), update: vi.fn(), remove: vi.fn() }));

vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: mocks.create, isPending: { value: false } }),
  useRetypeConnection: () => ({ mutateAsync: mocks.retype, isPending: { value: false } }),
  useUpdateLink: () => ({ mutateAsync: mocks.update }),
  useRemoveConnection: () => ({ mutateAsync: mocks.remove }),
}));

// A plain textarea stands in for the Tiptap editor, which needs a real DOM.
const EditorStub = defineComponent({
  props: { modelValue: { type: String, default: null } },
  emits: ["update:modelValue"],
  template: '<textarea data-testid="editor" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
});

const npc = { id: "npc-1", name: "Maera" } as Npc;
const member = { id: "pm-1", name: "Wren Ashdown", class: "Wizard", level: 5, portrait_url: null } as PartyMember;

function mountRow(props: { shared?: boolean; metAt?: string | null; connection?: Connection | null; others?: Connection[] } = {}) {
  return mount(NpcPartyRow, {
    props: { npc, member, shared: false, ...props },
    global: { stubs: { RichTextEditor: EditorStub, FocalImage: true } },
  });
}

const link = (over: Partial<Connection> = {}): Connection => ({
  source: "link", row_id: "link-1", type: "ally", outward: true, other_kind: "party_member", other_id: "pm-1",
  other_name: "Wren Ashdown", other_image: null, note: null, told: "Old friend", player_visible_to: null,
  ai_provenance: null, role: null, status: null, ...over,
});

const thisYearOnFourthOctober = new Date(new Date().getFullYear(), 9, 4, 12).toISOString();

describe("NpcPartyRow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const m of Object.values(mocks)) m.mockReset().mockResolvedValue(undefined);
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

  it("never creates a link from a blank line", async () => {
    const row = mountRow();
    await row.findAll("button").find((b) => b.text() === "+ Wren's connection")!.trigger("click");
    await vi.advanceTimersByTimeAsync(11_000);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates the link on the first type chosen, revealed to that character", async () => {
    const row = mountRow();
    await row.findAll("button").find((b) => b.text() === "+ Wren's connection")!.trigger("click");
    await row.get("select").setValue("rival:from");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: "npc", id: "npc-1" },
        other: expect.objectContaining({ kind: "party_member", id: "pm-1" }),
        choice: expect.objectContaining({ key: "rival" }),
        playerVisibleTo: ["pm-1"],
      }),
    );
  });

  it("retypes in place after the link exists and tells that player", async () => {
    const row = mountRow({ connection: link({ player_visible_to: [] }) });
    await row.get("select").setValue("friend:from");
    await flushPromises();
    expect(mocks.retype).toHaveBeenCalledWith(
      expect.objectContaining({ connection: expect.objectContaining({ row_id: "link-1" }), choice: expect.objectContaining({ key: "friend" }) }),
    );
    expect(mocks.update).toHaveBeenCalledWith({ id: "link-1", playerVisibleTo: ["pm-1"] });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("lists every further link between them as its own retypable chip and hides the types already held", async () => {
    const row = mountRow({ connection: link(), others: [link({ row_id: "link-2", type: "rival", told: null })] });
    const chip = row.get('[data-testid="party-row-others"] select');
    expect(chip.attributes("aria-label")).toContain("Another connection");
    const main = row.findAll("select")[0]!.findAll("option").map((o) => o.attributes("value"));
    expect(main.some((v) => v?.startsWith("rival:"))).toBe(false);
    expect(main).toContain("ally:from");
    const chipValues = chip.findAll("option").map((o) => o.attributes("value"));
    expect(chipValues.some((v) => v?.startsWith("ally:"))).toBe(false);
    await chip.setValue("friend:from");
    await flushPromises();
    expect(mocks.retype).toHaveBeenCalledWith(
      expect.objectContaining({ connection: expect.objectContaining({ row_id: "link-2" }), choice: expect.objectContaining({ key: "friend" }) }),
    );
  });

  it("offers a directed type both ways and a symmetric one once", () => {
    const values = mountRow({ connection: link() }).findAll("option").map((o) => o.attributes("value"));
    expect(values).toContain("mentor_of:from");
    expect(values).toContain("mentor_of:to");
    expect(values.filter((v) => v?.startsWith("friend:"))).toEqual(["friend:from"]);
  });

  it("files a line written before any type under the default type", async () => {
    const row = mountRow();
    await row.findAll("button").find((b) => b.text() === "+ Wren's connection")!.trigger("click");
    await row.get('[data-testid="editor"]').setValue("Owes Wren a life debt");
    await vi.advanceTimersByTimeAsync(2_500);
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ choice: expect.objectContaining({ key: "contact" }), told: "Owes Wren a life debt", playerVisibleTo: ["pm-1"] }),
    );
  });

  it("saves an edited line onto the existing link", async () => {
    const row = mountRow({ connection: link({ player_visible_to: ["pm-1"] }) });
    await row.get('[data-testid="editor"]').setValue("Changed");
    await vi.advanceTimersByTimeAsync(2_500);
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "link-1", told: "Changed", playerVisibleTo: ["pm-1"] });
  });

  it("keeps the link when the line is cleared", async () => {
    const row = mountRow({ connection: link({ player_visible_to: ["pm-1"] }) });
    await row.get('[data-testid="editor"]').setValue("");
    await vi.advanceTimersByTimeAsync(2_500);
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "link-1", told: "", playerVisibleTo: ["pm-1"] });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
