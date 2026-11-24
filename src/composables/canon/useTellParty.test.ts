import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: (e: unknown) => String(e) } }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

import { useTellParty } from "./useTellParty";

function run() {
  let result!: ReturnType<typeof useTellParty>;
  const Host = defineComponent({
    setup() {
      result = useTellParty();
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }]] } });
  return result;
}

describe("useTellParty", () => {
  const told = vi.fn();
  beforeEach(() => {
    fake.reset();
    mocks.confirm.mockReset();
    mocks.toastError.mockReset();
    told.mockReset().mockReturnValue(2);
    fake.onRpc("tell_party_canon_truth", (args) => told(args));
  });

  // Bug caught (#1258 item 14): Tell the party fired the moment it was pressed, so a stray tap made a truth known to
  // everyone for good. It asks first, and a "no" tells no one.
  it("asks first and tells no one when the player says no", async () => {
    mocks.confirm.mockResolvedValue(false);
    expect(await run().tellParty({ id: "t1", title: "The river gives back" })).toBe(false);
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(told).not.toHaveBeenCalled();
  });

  // Bug caught: the confirm was asked and then ignored, or the call named another truth.
  it("tells the party the truth named once the player says yes", async () => {
    mocks.confirm.mockResolvedValue(true);
    expect(await run().tellParty({ id: "t1", title: "The river gives back" })).toBe(true);
    expect(told).toHaveBeenCalledTimes(1);
    expect(told).toHaveBeenCalledWith({ p_entry_id: "t1" });
  });

  // Bug caught: a refusal (the character does not know it) read as success, so the truth stayed under "Only you know" with no word said.
  it("reports false and toasts when the database refuses", async () => {
    mocks.confirm.mockResolvedValue(true);
    fake.failNext("tell_party_canon_truth", { message: "not yours to tell", code: "42501" });
    expect(await run().tellParty({ id: "t1", title: "x" })).toBe(false);
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalled();
  });
});
