import { defineComponent, h, ref, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  campaignId: "campaign-1" as string | null,
  /** Set to stall dashboard_layouts reads / writes until the promise settles. */
  holdReads: null as null | Promise<void>,
  holdWrites: null as null | Promise<void>,
  errors: [] as string[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const query = fake.client.from(table);
      if (table !== "dashboard_layouts") return query;
      // The fake executes at await time, so delaying the await stalls the request
      // mid-flight; reads and writes are stalled independently.
      let isWrite = false;
      return new Proxy(query, {
        get(target, prop, receiver) {
          if (prop === "then") {
            const run = Reflect.get(target, prop, target) as (...args: unknown[]) => unknown;
            return (...args: unknown[]) =>
              ((isWrite ? mocks.holdWrites : mocks.holdReads) ?? Promise.resolve()).then(() => run.apply(target, args));
          }
          const member = Reflect.get(target, prop, receiver);
          if ((prop === "upsert" || prop === "delete") && typeof member === "function") {
            return (...args: unknown[]) => {
              isWrite = true;
              return member.apply(receiver, args);
            };
          }
          return member;
        },
      });
    },
  },
  getCurrentUser: () => mocks.user,
}));

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
    fromError: (cause: unknown) => (cause !== null && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause)),
  }),
}));

import { useDashboardLayout } from "./useDashboardLayout";
import { DEFAULT_LAYOUTS } from "@/lib/dashboard/defaultLayouts";
import {
  DASHBOARD_WIDGETS,
  defaultHeightFor,
  widgetById,
  type DashboardSurface,
  type WidgetHeight,
} from "@/lib/dashboard/widgetCatalog";

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
  fake.reset();
  mocks.user = { id: "user-1" };
  mocks.campaignId = "campaign-1";
  mocks.holdReads = null;
  mocks.holdWrites = null;
  mocks.errors.length = 0;
});

/** Seed one saved row for the signed-in DM, the open campaign and a surface. */
function saved(surface: string, layout: unknown, owner: { user_id?: string; campaign_id?: string } = {}) {
  fake.seed("dashboard_layouts", [{ user_id: "user-1", campaign_id: "campaign-1", surface, layout, ...owner }]);
}


/** The height a widget resolves to when a saved blob does not name one. */
function heightOf(id: string): WidgetHeight {
  const widget = widgetById(id);
  if (widget === undefined) throw new Error(`fixture widget "${id}" is not registered`);
  return defaultHeightFor(widget);
}

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
  // half a layout, or crashing the dashboard, would both be worse.
  it("falls back to the defaults when the stored blob is malformed", async () => {
    saved("prep", { widgets: "nope" });
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    expect(api().isCustomized.value).toBe(false);
  });

  it("renders a saved arrangement when one exists", async () => {
    saved("prep", {
      widgets: [
        { key: "party", id: "party", width: "full" },
        { key: "quests", id: "quests", width: "wide" },
      ],
      known: DASHBOARD_WIDGETS.map((w) => w.id),
    });
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    // Heights are resolved on read (#768): a blob saved before heights existed
    // carries none, and each entry comes back with its widget's own default
    // rather than absent, which is why the feature needed no migration.
    expect(api().widgets.value).toEqual([
      { key: "party", id: "party", width: "full", height: heightOf("party") },
      { key: "quests", id: "quests", width: "wide", height: heightOf("quests") },
    ]);
    expect(api().isCustomized.value).toBe(true);
    expect(api().dense.value).toBe(false);
  });

  // The table's RLS says the same thing, but RLS is a ceiling: a second DM's
  // row, another campaign's row and the other surface's row all exist, and the
  // read has to name which one is meant.
  it("reads only this DM's row for this campaign and surface", async () => {
    const other = { widgets: [{ key: "party", id: "party", width: "full" }], known: [] };
    saved("prep", other, { user_id: "user-2" });
    saved("prep", other, { campaign_id: "campaign-2" });
    saved("session", other);
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    expect(api().isCustomized.value).toBe(false);
  });

  // `known` is what lets the merge tell a widget the DM removed from one that
  // shipped later. A save that forgot to stamp it would make every widget look
  // new on the next load.
  it("stamps every registry id into known on save, filed under this DM, campaign and surface", async () => {
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    await api().saveLayout([{ key: "party", id: "party", width: "full" }], false);

    expect(fake.rows("dashboard_layouts")).toEqual([
      {
        user_id: "user-1",
        campaign_id: "campaign-1",
        surface: "prep",
        layout: {
          widgets: [{ key: "party", id: "party", width: "full" }],
          known: DASHBOARD_WIDGETS.map((w) => w.id),
        },
      },
    ]);
  });

  it("saving again replaces the one row rather than adding a second", async () => {
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    await api().saveLayout([{ key: "party", id: "party", width: "full" }], false);
    await api().saveLayout([{ key: "quests", id: "quests", width: "cell" }], true);

    const rows = fake.rows("dashboard_layouts");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.layout).toMatchObject({ widgets: [{ key: "quests" }], dense: true });
  });

  it("keeps each surface's arrangement apart: saving At-the-table does not overwrite Prep", async () => {
    const surface = ref<DashboardSurface>("prep");
    const { api } = open(surface);
    await flushPromises();
    await api().saveLayout([{ key: "party", id: "party", width: "full" }], false);
    surface.value = "session";
    await flushPromises();
    await api().saveLayout([{ key: "quests", id: "quests", width: "cell" }], false);

    expect(fake.rows("dashboard_layouts").map((r) => r.surface).sort()).toEqual(["prep", "session"]);
  });

  // A refetch already in flight when a drag saves would otherwise land after the
  // optimistic write and put the old arrangement back mid-drag.
  it("is not undone by a read that was already in flight when the arrangement changed", async () => {
    saved("prep", { widgets: [{ key: "party", id: "party", width: "full" }], known: DASHBOARD_WIDGETS.map((w) => w.id) });
    let releaseRead!: () => void;
    mocks.holdReads = new Promise<void>((resolve) => { releaseRead = resolve; });
    let releaseWrite!: () => void;
    mocks.holdWrites = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();

    const saving = api().saveLayout([{ key: "quests", id: "quests", width: "cell" }], false);
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["quests"]);

    mocks.holdReads = null;
    releaseRead();
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["quests"]);

    mocks.holdWrites = null;
    releaseWrite();
    await saving;
  });

  // Customize mode (#763) saves through on every reorder. If the grid waited for
  // the round trip it would snap back mid-drag, which is the whole reason this
  // path is optimistic.
  it("shows the new arrangement before the write resolves", async () => {
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();

    let release!: () => void;
    mocks.holdWrites = new Promise<void>((resolve) => { release = resolve; });
    const saving = api().saveLayout([{ key: "quests", id: "quests", width: "cell" }], false);
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["quests"]);
    expect(api().isSaving.value).toBe(true);
    expect(fake.rows("dashboard_layouts")).toEqual([]);

    mocks.holdReads = null;
  mocks.holdWrites = null;
    release();
    await saving;
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["quests"]);
    expect(api().isSaving.value).toBe(false);
  });

  it("puts the previous arrangement back, and says so, when the write fails", async () => {
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();

    let release!: () => void;
    mocks.holdWrites = new Promise<void>((resolve) => { release = resolve; });
    fake.failNext("dashboard_layouts", { message: "offline" });
    const saving = api().saveLayout([{ key: "quests", id: "quests", width: "cell" }], false);
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["quests"]);

    mocks.holdReads = null;
  mocks.holdWrites = null;
    release();
    await expect(saving).rejects.toMatchObject({ message: "offline" });
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    expect(mocks.errors).toEqual(["offline"]);
  });

  // Deleting the row *is* the reset: absent means "use the defaults". It must
  // delete this DM's row for this surface and no one else's.
  it("returns to the defaults on reset, leaving other rows alone", async () => {
    const layout = { widgets: [{ key: "party", id: "party", width: "full" }], known: [] };
    saved("prep", layout);
    saved("session", layout);
    saved("prep", layout, { user_id: "user-2" });
    saved("prep", layout, { campaign_id: "campaign-2" });
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    expect(api().isCustomized.value).toBe(true);

    await api().resetLayout();
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
    const left = fake.rows("dashboard_layouts").map((r) => [r.user_id, r.campaign_id, r.surface].join("/")).sort();
    expect(left).toEqual(["user-1/campaign-1/session", "user-1/campaign-2/prep", "user-2/campaign-1/prep"]);
  });

  // Prep and At-the-table are separate arrangements, so switching the segmented
  // control must read the other row rather than re-show the one in hand.
  it("reads a different row when the surface changes", async () => {
    saved("session", {
      widgets: [{ key: "live-encounter", id: "live-encounter", width: "full" }],
      known: DASHBOARD_WIDGETS.map((w) => w.id),
    });
    const surface = ref<DashboardSurface>("prep");
    const { api } = open(surface);
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));

    surface.value = "session";
    await flushPromises();
    expect(api().widgets.value.map((e) => e.key)).toEqual(["live-encounter"]);
  });

  it("does not query at all with no campaign open", async () => {
    mocks.campaignId = null;
    const { api } = open(ref<DashboardSurface>("prep"));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(api().widgets.value.map((e) => e.key)).toEqual(keysOf("prep"));
  });
});
