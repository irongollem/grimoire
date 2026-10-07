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
        return { error: null };
      },
    }),
    select: () => chain,
    single: async () =>
      mocks.insertError
        ? { data: null, error: mocks.insertError }
        : { data: { id: `${table}-${++mocks.nextId}` }, error: null },
  };
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: (table: string) => builder(table),
    functions: {
      invoke: vi.fn(async (_fn: string, opts: { body: { entities: Record<string, unknown[]> } }) => {
        mocks.invokeBodies.push(opts.body);
        return { data: { matches: {}, semantic: false }, error: null };
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
});
