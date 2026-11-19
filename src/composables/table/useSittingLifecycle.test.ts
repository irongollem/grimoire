import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  leave: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/table/useLeaveTable", async () => {
  const { ref: makeRef } = await import("vue");
  return { useLeaveTable: () => ({ leaving: makeRef(false), leave: mocks.leave }) };
});
vi.mock("@/lib/toast", () => ({ toast: { info: mocks.info, error: mocks.error } }));

import { useAppUiStore } from "@/stores/ui/app";
import type { TurnFailure } from "@/lib/table/solo/turnRefusal";
import { useSittingLifecycle } from "./useSittingLifecycle";

const HOUR = 60 * 60 * 1000;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

function sit(start: { created?: number; updated?: number; running?: boolean; left?: boolean } = {}) {
  const state = {
    sessionId: ref<string | null>("s-1"),
    sitting: ref<{ created_at: string; updated_at: string } | undefined>({ created_at: ago(start.created ?? HOUR), updated_at: ago(start.updated ?? 60_000) }),
    hasLeft: ref(start.left ?? false),
    inFight: ref(false),
    running: ref(start.running ?? false),
    asking: ref(false),
    turns: ref(3),
    failure: ref<TurnFailure | null>(null),
    stopTurn: vi.fn(),
    stopVoice: vi.fn(),
  };
  let api!: ReturnType<typeof useSittingLifecycle>;
  const Host = defineComponent({
    setup() {
      api = useSittingLifecycle({
        campaignId: () => "c-1",
        sessionId: () => state.sessionId.value,
        sitting: () => state.sitting.value,
        hasLeft: () => state.hasLeft.value,
        inFight: () => state.inFight.value,
        running: () => state.running.value,
        asking: () => state.asking.value,
        turns: () => state.turns.value,
        failure: () => state.failure.value,
        stopTurn: state.stopTurn,
        stopVoice: state.stopVoice,
      });
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } });
  return { api, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  mocks.leave.mockResolvedValue({ endedSession: true, noteId: null });
});

describe("ending a sitting after a long pause (#1021 row 25)", () => {
  it("gets up and says why when the table has stood idle past six hours", async () => {
    sit({ updated: 7 * HOUR });
    await flushPromises();
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("ended while you were away"), expect.anything());
    expect(mocks.leave).toHaveBeenCalledWith("c-1", "s-1");
    expect(mocks.push).toHaveBeenCalledWith("/table");
  });

  it("leaves a sitting alone that has stood idle five hours", async () => {
    sit({ updated: 5 * HOUR });
    await flushPromises();
    expect(mocks.leave).not.toHaveBeenCalled();
  });

  it("does not end a sitting while a turn is still being answered", async () => {
    sit({ updated: 7 * HOUR, running: true });
    await flushPromises();
    expect(mocks.leave).not.toHaveBeenCalled();
  });

  it("does not end a sitting that was already left", async () => {
    sit({ updated: 7 * HOUR, left: true });
    await flushPromises();
    expect(mocks.leave).not.toHaveBeenCalled();
  });

  it("ends the sitting the server says is over, once however often it says so", async () => {
    const { state } = sit();
    state.failure.value = { message: "over", action: "ended" };
    await nextTick();
    state.failure.value = { message: "over again", action: "ended" };
    await flushPromises();
    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(mocks.leave).toHaveBeenCalledTimes(1);
  });

  it("does not end the sitting for a refusal that is not the end", async () => {
    const { state } = sit();
    state.failure.value = { message: "no credits", action: "credits" };
    await flushPromises();
    expect(mocks.leave).not.toHaveBeenCalled();
  });
});

describe("getting up from the table", () => {
  it("goes anyway, and says so, when leaving could not be recorded", async () => {
    mocks.leave.mockResolvedValue(null);
    const { api, state } = sit();
    await api.leave();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("could not be recorded"));
    expect(state.stopVoice).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/table");
  });

  it("says nothing when leaving was recorded", async () => {
    const { api } = sit();
    await api.leave();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("stops the turn first and ends nothing for a conversation that does not exist yet", async () => {
    const { api, state } = sit();
    state.sessionId.value = null;
    await api.leave();
    expect(state.stopTurn).toHaveBeenCalled();
    expect(mocks.leave).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/table");
  });

  it("goes back to being the Dungeon Master", async () => {
    const appUi = useAppUiStore();
    appUi.enterTablePlay("m-1", "s-1");
    const { api } = sit();
    await api.leave();
    expect(appUi.tablePlay).toBeNull();
  });
});

describe("offering a new sitting after a long one", () => {
  it("offers one once the sitting is past four hours", () => {
    expect(sit({ created: 5 * HOUR }).api.offersNew.value).toBe(true);
  });

  it("does not offer one to a short sitting", () => {
    expect(sit({ created: HOUR }).api.offersNew.value).toBe(false);
  });

  it.each([
    ["in a fight, which a new sitting would drop", "inFight"],
    ["while a turn is being answered", "running"],
    ["while a roll is being waited on", "asking"],
    ["after the sitting was left", "hasLeft"],
  ] as const)("does not offer one %s", async (_title, key) => {
    const { api, state } = sit({ created: 5 * HOUR });
    state[key].value = true;
    await nextTick();
    expect(api.offersNew.value).toBe(false);
  });

  it("does not offer one before the first turn has made a conversation", async () => {
    const { api, state } = sit({ created: 5 * HOUR });
    state.sessionId.value = null;
    await nextTick();
    expect(api.offersNew.value).toBe(false);
  });

  it("stops offering after Not now, until more has been played", async () => {
    const { api, state } = sit({ created: 5 * HOUR });
    api.putOff();
    await nextTick();
    expect(api.offersNew.value).toBe(false);
    state.turns.value = 3 + 40;
    await nextTick();
    expect(api.offersNew.value).toBe(true);
  });
});
