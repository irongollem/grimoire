import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";

const select = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "u1" }),
  supabase: {
    from: () => ({
      select: (cols: string) => {
        const chain = {
          eq: () => chain,
          in: (_col: string, types: string[]) => select(cols, types),
        };
        return chain;
      },
      upsert: (...a: unknown[]) => upsert(...a),
    }),
  },
}));

import { useCampaignStore } from "@/stores/campaign";
import { useReadMarkers, useMarkRead } from "./useReadItems";

function mountWith<T>(qc: QueryClient, setup: () => T): T {
  let out!: T;
  const app = createApp(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return out;
}

beforeEach(() => {
  select.mockReset();
  upsert.mockReset();
  setActivePinia(createPinia());
  useCampaignStore().activeCampaignId = "c1";
});

describe("useReadMarkers", () => {
  it("fetches every requested type in one request and tells them apart", async () => {
    select.mockResolvedValue({
      data: [{ entity_type: "quest", entity_id: "q1", read_at: "2026-10-01T00:00:00Z" }],
      error: null,
    });
    const qc = new QueryClient();
    const r = mountWith(qc, () => useReadMarkers(["quest", "puzzle", "handout", "note"]));
    await vi.waitFor(() => expect(r.data.value).toBeDefined());
    expect(select).toHaveBeenCalledTimes(1);
    expect(select.mock.calls[0][1]).toEqual(["handout", "note", "puzzle", "quest"]);
    // read after the update: not new; same id under another type: unread marker absent
    expect(r.isNew("quest", "q1", "2026-09-01T00:00:00Z")).toBe(false);
    expect(r.isNew("puzzle", "q1", "2026-09-01T00:00:00Z")).toBe(true);
  });

  it("mark-as-read updates the shared entry optimistically", async () => {
    select.mockResolvedValue({ data: [], error: null });
    upsert.mockResolvedValue({ error: null });
    const qc = new QueryClient();
    const { markers, mark } = mountWith(qc, () => ({
      markers: useReadMarkers(["quest", "puzzle"]),
      mark: useMarkRead(),
    }));
    await vi.waitFor(() => expect(markers.data.value).toBeDefined());
    expect(markers.isNew("quest", "q9", "2026-09-01T00:00:00Z")).toBe(true);
    mark.mutate({ entityType: "quest", entityId: "q9" });
    await vi.waitFor(() => expect(markers.isNew("quest", "q9", "2026-09-01T00:00:00Z")).toBe(false));
    expect(markers.isNew("puzzle", "q9", "2026-09-01T00:00:00Z")).toBe(true);
  });
});
