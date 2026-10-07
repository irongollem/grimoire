import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import type { DmNoteSubject } from "@/types/dmNote.types";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useDmNote } from "./useDmNote";

const mocks = vi.hoisted(() => ({
  serverValue: null as string | null,
  /** campaign_id of the entity rows a note-kind subject lives in, by table. */
  entityCampaigns: {} as Record<string, string | null>,
  reads: [] as { table: string; column: string }[],
  readError: null as Error | null,
  /** When set, a read waits on it: the note's server copy has not arrived yet. */
  gate: null as Promise<void> | null,
  touchError: null as Error | null,
  updates: [] as { table: string; patch: Record<string, unknown>; id: string }[],
  upserts: [] as { row: Record<string, unknown>; opts: unknown }[],
  create: vi.fn(),
  updateNote: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "me" }),
  supabase: {
    from: (table: string) => ({
      select: (column: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            mocks.reads.push({ table, column });
            if (mocks.gate) await mocks.gate;
            if (mocks.readError) return Promise.resolve({ data: null, error: mocks.readError });
            const value = column === "campaign_id" ? mocks.entityCampaigns[table] : mocks.serverValue;
            return Promise.resolve({ data: { [column]: value }, error: null });
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          mocks.updates.push({ table, patch, id });
          return Promise.resolve({ error: null });
        },
      }),
      upsert: (row: Record<string, unknown>, opts: unknown) => {
        mocks.upserts.push({ row, opts });
        return Promise.resolve({ error: mocks.touchError });
      },
    }),
  },
}));

vi.mock("./useEntityNotes", () => ({
  useEntityNotes: () => ({ data: ref([]), isLoading: ref(false) }),
  useCreateEntityNote: () => ({ mutateAsync: mocks.create }),
  useUpdateEntityNote: () => ({ mutateAsync: mocks.updateNote }),
  useDeleteEntityNote: () => ({ mutateAsync: vi.fn() }),
}));

const doc = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }] });

function setup(initial: DmNoteSubject | null) {
  const subject = ref<DmNoteSubject | null>(initial);
  const queryClient = new QueryClient();
  let handle!: ReturnType<typeof useDmNote>;
  mount(
    defineComponent({
      setup() {
        handle = useDmNote(subject);
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { subject, handle, queryClient };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(2500);
  await flushPromises();
}

const npc: DmNoteSubject = { type: "npc", id: "n1", label: "Brenna" };
const deity: DmNoteSubject = { type: "deity", id: "d1", label: "Tyr" };

describe("useDmNote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    useAuthStore().user = { id: "me" } as never;
    useCampaignStore().activeCampaignId = "camp-1";
    mocks.serverValue = null;
    mocks.entityCampaigns = {};
    mocks.reads.length = 0;
    mocks.readError = null;
    mocks.touchError = null;
    mocks.updates.length = 0;
    mocks.upserts.length = 0;
    mocks.create.mockReset().mockResolvedValue({ id: "created" });
    mocks.updateNote.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads a column note and saves an edit to that column, then records a touch", async () => {
    mocks.serverValue = doc("old");
    const { handle } = setup(npc);
    await flushPromises();
    expect(handle.draft.content).toBe(doc("old"));

    handle.draft.content = doc("new");
    await settle();
    expect(mocks.updates).toEqual([{ table: "npcs", patch: { notes: doc("new") }, id: "n1" }]);
    expect(mocks.upserts).toHaveLength(1);
    expect(mocks.upserts[0].row).toMatchObject({
      user_id: "me", campaign_id: "camp-1", entity_type: "npc", entity_id: "n1", entity_label: "Brenna",
    });
    expect(mocks.upserts[0].opts).toEqual({ onConflict: "user_id,campaign_id,entity_type,entity_id" });
  });

  it("never saves a column note typed over a read that has not landed, so an NPC opened from the list cannot be blanked (#999)", async () => {
    mocks.serverValue = doc("old");
    let release!: () => void;
    mocks.gate = new Promise<void>((resolve) => { release = resolve; });
    const { handle } = setup(npc);
    handle.draft.content = doc("typed too early");
    await settle();
    expect(mocks.updates).toEqual([]);
    mocks.gate = null;
    release();
    await flushPromises();
  });

  it("writes null for a blank column note and uses the item's dm_notes column", async () => {
    mocks.serverValue = doc("old");
    const { handle } = setup({ type: "item", id: "i1", label: "Sword" });
    await flushPromises();
    handle.draft.content = doc("");
    await settle();
    expect(mocks.updates).toEqual([{ table: "items", patch: { dm_notes: null }, id: "i1" }]);
  });

  it("does not fail the save when the touch cannot be recorded", async () => {
    mocks.touchError = new Error("nope");
    const { handle } = setup(npc);
    await flushPromises();
    handle.draft.content = doc("x");
    await settle();
    expect(handle.status.value).toBe("saved");
    expect(console.error).toHaveBeenCalled();
  });

  it("skips the touch without an active campaign", async () => {
    useCampaignStore().activeCampaignId = null;
    const { handle } = setup(npc);
    await flushPromises();
    handle.draft.content = doc("x");
    await settle();
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.upserts).toHaveLength(0);
  });

  it("creates a private entity note under the deity's own campaign, not the active one", async () => {
    mocks.entityCampaigns = { deities: "camp-of-tyr" };
    const { handle } = setup(deity);
    await flushPromises();
    handle.draft.content = doc("Patron of the watch");
    await settle();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: "deity", entity_id: "d1", is_private: true, shared_with_dm: false, campaign_id: "camp-of-tyr",
    }));
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.upserts[0].row).toMatchObject({ entity_type: "deity", entity_label: "Tyr" });
  });

  it("files a hero's note under no campaign, since a hero is app-wide", async () => {
    const { handle } = setup({ type: "hero", id: "h1", label: "Minsc" });
    await flushPromises();
    handle.draft.content = doc("Go for the eyes");
    await settle();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: "hero", entity_id: "h1", campaign_id: null,
    }));
    expect(mocks.reads.filter((r) => r.column === "campaign_id")).toEqual([]);
  });

  it("flushes a pending edit to the entity it was typed about when the subject changes", async () => {
    const { handle, subject } = setup(npc);
    await flushPromises();
    handle.draft.content = doc("about Brenna");
    subject.value = deity;
    await flushPromises();
    expect(mocks.updates).toEqual([{ table: "npcs", patch: { notes: doc("about Brenna") }, id: "n1" }]);
    expect(handle.draft.content).toBeNull();
  });

  it("makes the editor remount when the subject changes", async () => {
    const { handle, subject } = setup(npc);
    await flushPromises();
    const before = handle.revision.value;
    subject.value = deity;
    await flushPromises();
    expect(handle.revision.value).toBeGreaterThan(before);
  });
});
