import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ select: mocks.select }) },
}));

import { usePlan } from "./usePlan";

const FREE = { id: "free", name: "Free" };
const PRO = { id: "pro", name: "Pro" };

let client: QueryClient;
let apps: App[] = [];

/** Runs `setup` inside a real component so vue-query has its injection context. */
function mount<T>(setup: () => T): T {
  let out!: T;
  const app = createApp(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: client });
  app.mount(document.createElement("div"));
  apps.push(app);
  return out;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("usePlan", () => {
  beforeEach(() => {
    apps.forEach((a) => a.unmount());
    apps = [];
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.select.mockReset();
  });

  it("answers every plan from one read", async () => {
    mocks.select.mockResolvedValue({ data: [FREE, PRO], error: null });
    const [free, pro] = mount(() => [usePlan("free"), usePlan("pro")] as const);
    await flush();

    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(free.data.value).toEqual(FREE);
    expect(pro.data.value).toEqual(PRO);
  });

  it("does not ask again on a later mount once the plan is there", async () => {
    mocks.select.mockResolvedValue({ data: [FREE, PRO], error: null });
    mount(() => usePlan("pro"));
    await flush();
    mount(() => usePlan("pro"));
    await flush();

    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("is an error while the plan is missing, and asks again on the next mount", async () => {
    mocks.select.mockResolvedValue({ data: [FREE], error: null });
    const first = mount(() => usePlan("pro"));
    await flush();
    expect(first.isError.value).toBe(true);
    expect(first.data.value).toBeUndefined();

    // The row exists now. A list cached as fresh forever would never find out.
    mocks.select.mockResolvedValue({ data: [FREE, PRO], error: null });
    const second = mount(() => usePlan("pro"));
    await flush();

    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(second.data.value).toEqual(PRO);
  });

  it("throws the read's own error", async () => {
    mocks.select.mockResolvedValue({ data: null, error: new Error("boom") });
    const plan = mount(() => usePlan("free"));
    await flush();
    expect(plan.isError.value).toBe(true);
  });
});
