import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { canonEntry } from "@/test/canonEntry";

const state = vi.hoisted(() => ({ entries: undefined as unknown, rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (name: string, args: unknown) => state.rpc(name, args) } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), fromError: (e: Error) => e.message } }));
vi.mock("@/composables/canon/useCanonEntries", async () => {
  const { computed } = await import("vue");
  return { useCanonEntries: () => ({ data: computed(() => state.entries), isSuccess: computed(() => state.entries !== undefined) }) };
});

import { openBackstory, useBackstoryEntry } from "./useBackstory";

function run(member: string) {
  let result!: ReturnType<typeof useBackstoryEntry>;
  const Host = defineComponent({
    setup() {
      result = useBackstoryEntry(member);
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }]] } });
  return result;
}

describe("openBackstory", () => {
  beforeEach(() => state.rpc.mockReset());

  it("answers the entry id, and throws the database's refusal instead of an empty id", async () => {
    state.rpc.mockResolvedValueOnce({ data: "e1", error: null });
    await expect(openBackstory("m1")).resolves.toBe("e1");
    expect(state.rpc).toHaveBeenCalledWith("open_backstory", { p_party_member_id: "m1" });
    state.rpc.mockResolvedValueOnce({ data: null, error: new Error("Not authorized") });
    await expect(openBackstory("m1")).rejects.toThrow("Not authorized");
  });
});

describe("useBackstoryEntry", () => {
  beforeEach(() => {
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ data: "e-new", error: null });
    state.entries = undefined;
  });

  // Bug caught: opening a character without a backstory showed nothing to write in, since the entry never existed.
  it("opens the backstory the first time a character without one is opened, once the entries have loaded", async () => {
    state.entries = [];
    run("m1");
    await flushPromises();
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("open_backstory", { p_party_member_id: "m1" });
  });

  // Bug caught: asking before the entries arrived made a second entry attempt for a character that already had one.
  it("asks nothing while the entries are still loading, and nothing for a character that has one", async () => {
    run("m1");
    await flushPromises();
    expect(state.rpc).not.toHaveBeenCalled();
    state.entries = [canonEntry({ id: "b1", part: "backstory", party_member_id: "m1" })];
    const w = run("m1");
    await flushPromises();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(w.entry.value?.id).toBe("b1");
  });

  it("finds each character's own entry, not another's", async () => {
    state.entries = [canonEntry({ id: "b2", part: "backstory", party_member_id: "m2" })];
    const w = run("m1");
    await flushPromises();
    expect(w.entry.value).toBeNull();
  });
});
