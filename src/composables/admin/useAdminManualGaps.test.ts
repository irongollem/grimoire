import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { useAdminManualGaps, useManualGapActions, type ManualGap } from "./useAdminManualGaps";

function gap(overrides: Partial<ManualGap> = {}): Record<string, unknown> {
  const row: ManualGap = {
    id: "g1",
    question: "How do I share a map?",
    question_key: "share map",
    asked_count: 1,
    pages_checked: [],
    first_asked_at: "2026-11-01T00:00:00Z",
    last_asked_at: "2026-11-02T00:00:00Z",
    covered_at: null,
    ...overrides,
  };
  return { ...row };
}

function run<T>(setup: () => T): { result: T; qc: QueryClient } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: T;
  const app = createApp(
    defineComponent({
      setup() {
        result = setup();
        return () => null;
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return { result, qc };
}

describe("useAdminManualGaps", () => {
  beforeEach(() => fake.reset());

  // Bug caught: ordering by recency only, so a one-off question tops the writing list.
  it("lists the most asked first, newest asking breaking a tie", async () => {
    fake.seed("manual_gaps", [
      gap({ id: "few", asked_count: 1, last_asked_at: "2026-11-20T00:00:00Z" }),
      gap({ id: "old-tie", asked_count: 5, last_asked_at: "2026-11-01T00:00:00Z" }),
      gap({ id: "new-tie", asked_count: 5, last_asked_at: "2026-11-10T00:00:00Z" }),
    ]);
    const { result } = run(() => useAdminManualGaps());
    await vi.waitFor(() => expect(result.data.value).toBeDefined());
    expect(result.data.value?.map((g) => g.id)).toEqual(["new-tie", "old-tie", "few"]);
  });

  // Bug caught: destructuring `data` alone turns a failed read into "no open gaps".
  it("reports a failed read instead of showing an empty list", async () => {
    fake.failNext("manual_gaps", { message: "boom" });
    const { result } = run(() => useAdminManualGaps());
    await vi.waitFor(() => expect(result.isError.value).toBe(true));
  });
});

describe("useManualGapActions", () => {
  beforeEach(() => fake.reset());

  // Bug caught: covered writing the wrong column, or null, leaving the gap open.
  it("markCovered stamps covered_at and reopen clears it, on that row only", async () => {
    fake.seed("manual_gaps", [gap({ id: "a" }), gap({ id: "b" })]);
    const { result } = run(() => useManualGapActions());

    await result.markCovered.mutateAsync("a");
    const rows = () => fake.rows("manual_gaps");
    expect(rows().find((r) => r.id === "a")?.covered_at).toEqual(expect.any(String));
    expect(rows().find((r) => r.id === "b")?.covered_at).toBeNull();

    await result.reopen.mutateAsync("a");
    expect(rows().find((r) => r.id === "a")?.covered_at).toBeNull();
  });

  // Bug caught: a refused write swallowed, so the admin thinks the gap is covered.
  it("throws when the database refuses the change", async () => {
    fake.seed("manual_gaps", [gap()]);
    const { result } = run(() => useManualGapActions());
    fake.failNext("manual_gaps", { message: "denied" });
    await expect(result.markCovered.mutateAsync("g1")).rejects.toMatchObject({ message: "denied" });
  });

  // Bug caught: remove deleting without an id filter, or the wrong row.
  it("remove deletes only the named gap and refreshes the list", async () => {
    fake.seed("manual_gaps", [gap({ id: "a" }), gap({ id: "b" })]);
    const { result, qc } = run(() => useManualGapActions());
    qc.setQueryData(["admin", "manual-gaps"], []);
    await result.remove.mutateAsync("a");
    expect(fake.rows("manual_gaps").map((r) => r.id)).toEqual(["b"]);
    expect(qc.getQueryState(["admin", "manual-gaps"])?.isInvalidated).toBe(true);
  });
});
