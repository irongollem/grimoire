import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { useAuthStore } from "@/stores/auth";
import { useTableNarratorVoice } from "./useTableNarratorVoice";

const ME = "u-me";
const OTHER = "u-other";

function sit(sessionId: string | null) {
  let api!: ReturnType<typeof useTableNarratorVoice>;
  const Host = defineComponent({
    setup() {
      api = useTableNarratorVoice(sessionId);
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
  return api;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  fake.reset();
  fake.seed("agent_sessions", [
    { id: "s-mine", user_id: ME, narrator_voice: "female" },
    { id: "s-theirs", user_id: OTHER, narrator_voice: "female" },
  ]);
  useAuthStore().user = { id: ME } as never;
});

describe("useTableNarratorVoice", () => {
  // Bug caught: the device's last choice shown at a table that was set otherwise, so the control names one voice
  // while the Narrator speaks in the other.
  it("shows the table's own voice at a table, whatever this device chose last", async () => {
    const door = sit(null);
    await door.choose("male");
    const table = sit("s-mine");
    await flushPromises();
    expect(table.voice.value).toBe("female");
  });

  // Bug caught: the change kept only on this device, so the server went on speaking in the old voice.
  it("changes the voice on the table's row, and a new table begins on that choice", async () => {
    const table = sit("s-mine");
    await flushPromises();
    await table.choose("male");
    expect(fake.rows("agent_sessions").find((r) => r.id === "s-mine")?.narrator_voice).toBe("male");
    expect(table.voice.value).toBe("male");
    expect(sit(null).voice.value).toBe("male");
  });

  // Bug caught: the update not scoped to the caller, so under a wider policy (a co-DM read turned write) one
  // account changes the voice at another's table; and a change that reached no row reported as done.
  it("never changes a table that is not this account's, and says so", async () => {
    const table = sit("s-theirs");
    await flushPromises();
    await expect(table.choose("male")).rejects.toThrow("Only the table's host");
    expect(fake.rows("agent_sessions").find((r) => r.id === "s-theirs")?.narrator_voice).toBe("female");
  });
});
