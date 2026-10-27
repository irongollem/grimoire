import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { AiProvenance } from "@edge-shared/provenance/types.ts";

const mocks = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  loadCalls: [] as { bucket: string; stem: string }[],
  fail: false,
}));

// The key parser is the real one (the registry is keyed by storage object, so
// the URL-to-key mapping is part of what this composable relies on); only the
// registry read is replaced.
vi.mock("@/lib/storage", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/storage")>()),
  loadImageProvenance: vi.fn(async (key: { bucket: string; stem: string }) => {
    mocks.loadCalls.push(key);
    if (mocks.fail) throw new Error("registry unavailable");
    return (mocks.records.get(`${key.bucket}/${key.stem}`) ?? null) as AiProvenance | null;
  }),
}));

import { useImageProvenance } from "./useImageProvenance";

const record = { model: "gpt-image-2", provider: "openai" } as unknown as AiProvenance;

function setup(initial: string | null | undefined) {
  const url = ref(initial);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: ReturnType<typeof useImageProvenance>;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useImageProvenance(url);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  );
  return { url, result: () => result.value, wrapper, client };
}

describe("useImageProvenance", () => {
  beforeEach(() => {
    mocks.records.clear();
    mocks.loadCalls.length = 0;
    mocks.fail = false;
  });

  it("is null while loading, then the record", async () => {
    mocks.records.set("npc-portraits/u/abc", record);
    const { result } = setup("https://cdn.test/npc-portraits/u/abc.webp");
    expect(result()).toBeNull();
    await flushPromises();
    expect(result()).toEqual(record);
  });

  it("resolves a size variant to the same record", async () => {
    mocks.records.set("npc-portraits/u/abc", record);
    const { result } = setup("https://cdn.test/npc-portraits/u/abc_w400.webp");
    await flushPromises();
    expect(result()).toEqual(record);
  });

  it("is null for a miss", async () => {
    const { result } = setup("https://cdn.test/npc-portraits/u/none.webp");
    await flushPromises();
    expect(mocks.loadCalls).toHaveLength(1);
    expect(result()).toBeNull();
  });

  it.each([null, undefined, "", "blob:http://x/1", "https://elsewhere.test/a.webp"])(
    "never queries for %s",
    async (value) => {
      const { result, client } = setup(value);
      await flushPromises();
      expect(mocks.loadCalls).toHaveLength(0);
      expect(result()).toBeNull();
      // Not even attempted: a query that ran and failed would report an error for an image that has no mark.
      expect(client.getQueryCache().getAll().every((q) => q.state.fetchStatus === "idle" && q.state.status !== "error")).toBe(true);
    },
  );

  it("follows a reactive url", async () => {
    mocks.records.set("npc-portraits/u/b", record);
    const { url, result } = setup("https://cdn.test/npc-portraits/u/a.webp");
    await flushPromises();
    expect(result()).toBeNull();
    url.value = "https://cdn.test/npc-portraits/u/b.webp";
    await flushPromises();
    expect(result()).toEqual(record);
  });

  it("asks once per image across mounts", async () => {
    mocks.records.set("npc-portraits/u/abc", record);
    const { client } = setup("https://cdn.test/npc-portraits/u/abc.webp");
    await flushPromises();
    mount(
      defineComponent({
        setup() {
          useImageProvenance("https://cdn.test/npc-portraits/u/abc_w400.webp");
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
    );
    await flushPromises();
    expect(mocks.loadCalls).toHaveLength(1);
  });

  it("surfaces a failed lookup as a query error, not a null answer", async () => {
    mocks.fail = true;
    const { client } = setup("https://cdn.test/npc-portraits/u/abc.webp");
    await flushPromises();
    const state = client.getQueryCache().find({ queryKey: ["image-provenance", "npc-portraits", "u/abc"] })?.state;
    expect(state?.status).toBe("error");
  });
});
