import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const mocks = vi.hoisted(() => ({
  invokeBodies: [] as { entities: Record<string, unknown[]> }[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as { table: string; patch: Record<string, unknown>; id: string }[],
  insertError: null as { code?: string; message: string } | null,
  insertErrorTables: null as string[] | null,
  updateError: null as { message: string } | null,
  invokeError: null as Error | null,
  user: { id: "user-1" } as { id: string } | null,
  nextId: 0,
}));

function builder(table: string) {
  const chain = {
    insert: (row: Record<string, unknown>) => {
      mocks.inserts.push({ table, row });
      return chain;
    },
    update: (patch: Record<string, unknown>) => ({
      eq: async (_col: string, id: string) => {
        mocks.updates.push({ table, patch, id });
        return { error: mocks.updateError };
      },
    }),
    select: () => chain,
    single: async () =>
      mocks.insertError && (mocks.insertErrorTables === null || mocks.insertErrorTables.includes(table))
        ? { data: null, error: mocks.insertError }
        : { data: { id: `${table}-${++mocks.nextId}` }, error: null },
  };
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => mocks.user,
  supabase: {
    from: (table: string) => builder(table),
    functions: {
      invoke: vi.fn(async (_fn: string, opts: { body: { entities: Record<string, unknown[]> } }) => {
        mocks.invokeBodies.push(opts.body);
        return mocks.invokeError
          ? { data: null, error: mocks.invokeError }
          : { data: { matches: {}, semantic: false }, error: null };
      }),
    },
  },
}));

import { useArchiveEntityMatches, useCreateArchiveImport, useRunArchiveSweep } from "./useArchiveImport";
import { useCampaignStore } from "@/stores/campaign";
import type { ArchivePage } from "@/lib/archiveImport/types";
import { entitiesForMatching } from "@/lib/archiveImport/archiveMatches";

function page(ref: string, kind: ArchivePage["kind"] = "npc"): ArchivePage {
  return {
    ref,
    path: ref,
    title: ref,
    folders: [],
    parentRef: null,
    kind,
    kindReason: "",
    tags: [],
    aliases: [],
    frontmatter: {},
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `About ${ref}` }] }] },
    links: [],
    notes: [],
    format: "markdown",
  };
}

function setup<T>(use: () => T): T {
  setActivePinia(createPinia());
  useCampaignStore().activeCampaignId = "camp-1";
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 }, mutations: { retry: false } } });
  let api!: T;
  mount(
    defineComponent({
      setup() {
        api = use();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return api;
}

beforeEach(() => {
  mocks.invokeBodies = [];
  mocks.inserts = [];
  mocks.updates = [];
  mocks.insertError = null;
  mocks.insertErrorTables = null;
  mocks.updateError = null;
  mocks.invokeError = null;
  mocks.user = { id: "user-1" };
  mocks.nextId = 0;
});

describe("useCreateArchiveImport", () => {
  it("inserts a review row carrying only the manifest, with no AI provenance and no source object", async () => {
    const { mutateAsync } = setup(() => useCreateArchiveImport());
    const pages = [page("a.md"), page("b.md", "note"), page("c.md", "note")];
    await mutateAsync({
      displayName: "My vault",
      source: "obsidian",
      pages,
      kinds: new Map([["c.md", "skip"]]),
      rightsAttested: true,
    });
    const { table, row } = mocks.inserts[0];
    expect(table).toBe("document_imports");
    expect(row).toMatchObject({
      campaign_id: "camp-1",
      source_kind: "archive",
      source_paths: [],
      status: "review",
      page_count: 2,
      display_name: "My vault",
      user_id: "user-1",
    });
    expect(row).not.toHaveProperty("source_text");
    expect(row).not.toHaveProperty("ai_provenance");
    expect(JSON.stringify(row.extracted)).not.toContain("About a.md");
    expect((row.extracted as { archive: { pages: unknown[] } }).archive.pages).toHaveLength(3);
  });

  it("refuses without the rights attestation and when every page is skipped", async () => {
    const { mutateAsync } = setup(() => useCreateArchiveImport());
    await expect(mutateAsync({ displayName: "x", source: "obsidian", pages: [page("a.md")], kinds: new Map(), rightsAttested: false })).rejects.toThrow(/rights/);
    await expect(
      mutateAsync({ displayName: "x", source: "obsidian", pages: [page("a.md")], kinds: new Map([["a.md", "skip"]]), rightsAttested: true }),
    ).rejects.toThrow(/nothing to import/);
    expect(mocks.inserts).toEqual([]);
  });

  it("refuses to start an import when nobody is signed in or no campaign is active", async () => {
    mocks.user = null;
    const signedOut = setup(() => useCreateArchiveImport());
    await expect(signedOut.mutateAsync({ displayName: "x", source: "obsidian", pages: [page("a.md")], kinds: new Map(), rightsAttested: true })).rejects.toThrow(/signed in/);
    mocks.user = { id: "user-1" };
    const noCampaign = setup(() => useCreateArchiveImport());
    useCampaignStore().activeCampaignId = null;
    await expect(noCampaign.mutateAsync({ displayName: "x", source: "obsidian", pages: [page("a.md")], kinds: new Map(), rightsAttested: true })).rejects.toThrow(/campaign/);
    expect(mocks.inserts).toEqual([]);
  });

  it("says who may import when the database refuses the caller", async () => {
    mocks.insertError = { code: "42501", message: "rls" };
    const { mutateAsync } = setup(() => useCreateArchiveImport());
    await expect(mutateAsync({ displayName: "x", source: "obsidian", pages: [page("a.md")], kinds: new Map(), rightsAttested: true })).rejects.toThrow(/DM/);
  });
});

describe("useArchiveEntityMatches", () => {
  it("sends a big export to import-match in batches of at most 300", async () => {
    const entities = entitiesForMatching(Array.from({ length: 650 }, (_, i) => ({ page: page(`p${i}.md`), kind: "npc" as const })));
    const api = setup(() => useArchiveEntityMatches("row-1", entities));
    await vi.waitFor(() => expect(mocks.invokeBodies).toHaveLength(3));
    await flushPromises();
    expect(mocks.invokeBodies.map((b) => b.entities.npcs.length)).toEqual([300, 300, 50]);
    expect(api.error.value).toBeNull();
  });

  it("fails the whole check when any batch fails, rather than showing a review that lacks candidates, and does not retry", async () => {
    mocks.invokeError = new Error("rate_limited");
    const entities = entitiesForMatching(Array.from({ length: 650 }, (_, i) => ({ page: page(`p${i}.md`), kind: "npc" as const })));
    const api = setup(() => useArchiveEntityMatches("row-1", entities));
    await vi.waitFor(() => expect(api.error.value).not.toBeNull());
    expect(api.error.value?.message).toContain("rate_limited");
    expect(mocks.invokeBodies).toHaveLength(1);
    expect(api.candidatesByKind.value.size).toBe(0);
  });

  it("asks nothing when there is nothing matchable", async () => {
    setup(() => useArchiveEntityMatches("row-1", {}));
    await flushPromises();
    expect(mocks.invokeBodies).toEqual([]);
  });
});

describe("useRunArchiveSweep", () => {
  it("writes the rows, then marks the import complete with a count per kind", async () => {
    const { runSweep } = setup(() => useRunArchiveSweep());
    const run = await runSweep(
      { id: "row-1", campaign_id: "camp-1" },
      {
        entries: [
          { page: page("Mara.md"), kind: "npc", decision: { action: "create" } },
          { page: page("Diary.md", "note"), kind: "note", decision: { action: "create" } },
        ],
        allPages: [page("Mara.md"), page("Diary.md", "note")],
      },
    );
    expect(run.finishError).toBeNull();
    expect(mocks.inserts.map((i) => i.table)).toEqual(["npcs", "notes"]);
    // A content row carries its owner; nothing carries AI provenance.
    for (const insert of mocks.inserts) {
      expect(insert.row.user_id).toBe("user-1");
      expect(insert.row).not.toHaveProperty("ai_provenance");
    }
    const finish = mocks.updates.find((u) => u.table === "document_imports");
    expect(finish).toMatchObject({ id: "row-1", patch: { status: "complete", imported_counts: { npcs: 1, notes: 1, locations: 0 } } });
  });

  it("reports that every row was written but the import could not be marked complete", async () => {
    mocks.updateError = { message: "could not update" };
    const { runSweep } = setup(() => useRunArchiveSweep());
    const run = await runSweep(
      { id: "row-1", campaign_id: "camp-1" },
      { entries: [{ page: page("Mara.md"), kind: "npc", decision: { action: "create" } }], allPages: [page("Mara.md")] },
    );
    expect(run.finishError).toBe("could not update");
    expect(run.report.perKind.npc.created).toBe(1);
  });

  it("stops a kind at the plan's limit: the refused row is named, the rest are not tried", async () => {
    mocks.insertError = { message: "quota_exceeded" };
    const { runSweep } = setup(() => useRunArchiveSweep());
    const run = await runSweep(
      { id: "row-1", campaign_id: "camp-1" },
      {
        entries: [
          { page: page("Mara.md"), kind: "npc", decision: { action: "create" } },
          { page: page("Tomas.md"), kind: "npc", decision: { action: "create" } },
        ],
        allPages: [page("Mara.md"), page("Tomas.md")],
      },
    );
    expect(run.report.perKind.npc).toMatchObject({ created: 0, stoppedAtQuota: true, failed: 2 });
    expect(run.report.failures.map((f) => f.message)).toEqual([
      "Your plan's limit was reached.",
      "Your plan's limit was reached before this one.",
    ]);
    expect(mocks.inserts).toHaveLength(1);
  });

  it("refuses to sweep when nobody is signed in", async () => {
    mocks.user = null;
    const { runSweep } = setup(() => useRunArchiveSweep());
    await expect(runSweep({ id: "row-1", campaign_id: "camp-1" }, { entries: [], allPages: [] })).rejects.toThrow(/signed in/);
    expect(mocks.inserts).toEqual([]);
  });

  it("writes a quest's opening beat without an owner column, which that table does not have", async () => {
    const { runSweep } = setup(() => useRunArchiveSweep());
    await runSweep(
      { id: "row-1", campaign_id: "camp-1" },
      { entries: [{ page: page("Quest.md", "quest"), kind: "quest", decision: { action: "create" } }], allPages: [page("Quest.md", "quest")] },
    );
    const quest = mocks.inserts.find((i) => i.table === "quests");
    const beat = mocks.inserts.find((i) => i.table === "quest_beats");
    expect(quest?.row.user_id).toBe("user-1");
    expect(beat).toBeDefined();
    expect(beat?.row).not.toHaveProperty("user_id");
  });
});
