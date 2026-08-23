import { defineComponent, h, ref, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

interface Deferred<T> {
  promise: Promise<T>;
  settle: (value: T) => void;
  fail: (cause: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let settle!: (value: T) => void;
  let fail!: (cause: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  campaignId: "campaign-1" as string | null,
  /** The row `select ... maybeSingle()` hands back, keyed by the surface asked for. */
  rows: new Map<string, { layout: unknown } | null>(),
  reads: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
  deletes: [] as Record<string, unknown>[],
  /** Left null for an immediate write; set to stall the upsert mid-flight. */
  pendingWrite: null as null | Deferred<{ data: { layout: unknown }; error: unknown }>,
  errors: [] as string[],
}));

/** `delete().eq()...` is awaited with no terminal call, so the real builder is
 *  itself a promise. Making the mock one too — rather than bolting a `then`
 *  onto a plain object — keeps it honest and keeps `unicorn/no-thenable` quiet. */
interface DeleteChain extends Promise<{ error: unknown }> {
  eq: (column: string, value: unknown) => DeleteChain;
}

vi.mock("@/lib/supabase", () => {
  const readChain = (record: Record<string, unknown>) => {
    const chain = {
      eq: (column: string, value: unknown) => {
        record[column] = value;
        return chain;
      },
      maybeSingle: () => {
        mocks.reads.push(record);
        const row = mocks.rows.get(String(record.surface));
        return { data: row === undefined ? null : row, error: null };
      },
    };
    return chain;
  };

  const deleteChain = () => {
    const record: Record<string, unknown> = {};
    // The filters are applied synchronously right after this is built, so the
    // microtask below always sees a fully populated record.
    const settled = Promise.resolve().then(() => {
      mocks.deletes.push(record);
      return { error: null };
    });
    const chain = Object.assign(settled, {
      eq: (column: string, value: unknown) => {
        record[column] = value;
        return chain;
      },
    }) as DeleteChain;
    return chain;
  };

  return {
    supabase: {
      from: () => ({
        select: () => readChain({}),
        upsert: (row: Record<string, unknown>) => {
          mocks.upserts.push(row);
          return {
            select: () => ({
              single: async () => {
                if (mocks.pendingWrite) return mocks.pendingWrite.promise;
                return { data: { layout: row.layout }, error: null };
              },
            }),
          };
        },
        delete: deleteChain,
      }),
    },
    getCurrentUser: () => mocks.user,
  };
});

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() {
      return mocks.campaignId;
    },
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    error: (message: string) => mocks.errors.push(message),
    fromError: (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
  }),
}));

import { useDashboardLayout } from "./useDashboardLayout";
import { DEFAULT_LAYOUTS } from "@/lib/dashboard/defaultLayouts";
import { DASHBOARD_WIDGETS, type DashboardSurface } from "@/lib/dashboard/widgetCatalog";

function open(surface: Ref<DashboardSurface>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: ReturnType<typeof useDashboardLayout>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useDashboardLayout(surface);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api, wrapper };
}

const keysOf = (surface: DashboardSurface) =>
  DEFAULT_LAYOUTS[surface].widgets.map((entry) => entry.key);

beforeEach(() => {
  mocks.user = { id: "user-1" };
  mocks.campaignId = "campaign-1";
  mocks.rows.clear();
  mocks.reads.length = 0;
  mocks.upserts.length = 0;
  mocks.deletes.length = 0;
  mocks.pendingWrite = null;
  mocks.errors.length = 0;
});

describe("useDashboardLayout", () => {
  // The dashboard has no loading state on purpose: an absent row merges to the
  // defaults, so a DM who never customized must see today's dashboard with no
  // flash of empty grid.
  it("renders the surface's defaults when nothing is saved", async () => {
    const { api } = open(ref<DashboardSurface>("prep"));
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    expect(api().isCustomized.value).toBe(false);
  });

  // A blob that does not parse must behave exactly as a missing row. Rendering
  // half a layout — or crashing the dashboard — would both be worse.
  it("falls back to the defaults when the stored blob is malformed", async () => {
    mocks.rows.set("prep", { layout: { widgets: "nope" } });
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    expect(api().isCustomized.value).toBe(false);
  });

  it("renders a saved arrangement when one exists", async () => {
    mocks.rows.set("prep", {
      layout: {
        widgets: [
          { key: "party", id: "party", width: "full" },
          { key: "quests", id: "quests", width: "wide" },
        ],
        known: DASHBOARD_WIDGETS.map((w) => w.id),
      },
    });
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    expect(api().widgets.value).toEqual([
      { key: "party", id: "party", width: "full" },
      { key: "quests", id: "quests", width: "wide" },
    ]);
    expect(api().isCustomized.value).toBe(true);
  });

  // `known` is what lets the merge tell a widget the DM removed from one that
  // shipped later. A save that forgot to stamp it would make every widget look
  // new on the next load.
  it("stamps every registry id into known on save", async () => {
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    await api().saveLayout([{ key: "party", id: "party", width: "full" }]);

    const written = mocks.upserts[0];
    expect(written).toMatchObject({
      user_id: "user-1",
      campaign_id: "campaign-1",
      surface: "prep",
    });
    expect(written?.layout).toEqual({
      widgets: [{ key: "party", id: "party", width: "full" }],
      known: DASHBOARD_WIDGETS.map((w) => w.id),
    });
  });

  // Customize mode (#763) saves through on every reorder. If the grid waited for
  // the round trip it would snap back mid-drag, which is the whole reason this
  // path is optimistic.
  it("shows the new arrangement before the write resolves", async () => {
    const write = deferred<{ data: { layout: unknown }; error: unknown }>();
    mocks.pendingWrite = write;

    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();

    const saving = api().saveLayout([{ key: "quests", id: "quests", width: "cell" }]);
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["quests"]);
    expect(api().isSaving.value).toBe(true);

    write.settle({
      data: { layout: { widgets: [{ key: "quests", id: "quests", width: "cell" }] } },
      error: null,
    });
    await saving;
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["quests"]);
  });

  it("puts the previous arrangement back when the write fails", async () => {
    const write = deferred<{ data: { layout: unknown }; error: unknown }>();
    mocks.pendingWrite = write;

    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();

    const saving = api().saveLayout([{ key: "quests", id: "quests", width: "cell" }]);
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["quests"]);

    write.fail(new Error("offline"));
    await expect(saving).rejects.toThrow("offline");
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    expect(mocks.errors).toEqual(["offline"]);
  });

  // Deleting the row *is* the reset — absent means "use the defaults".
  it("returns to the defaults on reset", async () => {
    mocks.rows.set("prep", {
      layout: { widgets: [{ key: "party", id: "party", width: "full" }], known: [] },
    });
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    expect(api().isCustomized.value).toBe(true);

    await api().resetLayout();
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    expect(mocks.deletes[0]).toMatchObject({ surface: "prep", user_id: "user-1" });
  });

  // Prep and At-the-table are separate arrangements, so switching the segmented
  // control must read the other row rather than re-show the one in hand.
  it("reads a different row when the surface changes", async () => {
    mocks.rows.set("session", {
      layout: {
        widgets: [{ key: "live-encounter", id: "live-encounter", width: "full" }],
        known: DASHBOARD_WIDGETS.map((w) => w.id),
      },
    });
    const surface = ref<DashboardSurface>("prep");
    const { api } = open(surface);
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));

    surface.value = "session";
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["live-encounter"]);
    expect(mocks.reads.map((r) => r.surface)).toEqual(["prep", "session"]);
  });

  // Every read is scoped to the signed-in user and the open campaign; the
  // table's RLS says the same thing, but a query that forgot would silently
  // return nothing rather than fail.
  it("does not query at all with no campaign open", async () => {
    mocks.campaignId = null;
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    expect(mocks.reads).toEqual([]);
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
  });
});
