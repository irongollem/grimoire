import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryItem } from "@/lib/table/solo/soloTypes";

const mocks = vi.hoisted(() => ({ error: vi.fn(), voice: null as null | Record<string, unknown> }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.error, info: vi.fn() } }));
vi.mock("@/composables/table/useTableVoice", async () => {
  const { ref: makeRef } = await import("vue");
  return {
    useTableVoice: () => {
      mocks.voice = {
        parts: makeRef({ narrator: true, characters: true, player: true }),
        unavailable: makeRef(false),
        spent: makeRef(false),
        broke: makeRef(false),
        speaking: makeRef(false),
        say: vi.fn(),
        replay: vi.fn(),
        stop: vi.fn(),
        setAllOff: vi.fn(),
        setPart: vi.fn(),
      };
      return mocks.voice;
    },
  };
});

import { useTableSpeech } from "./useTableSpeech";

type Flag = { value: boolean };
const voice = () => mocks.voice as unknown as { unavailable: Flag; spent: Flag; broke: Flag; say: ReturnType<typeof vi.fn>; replay: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; setAllOff: ReturnType<typeof vi.fn> };

const said: StoryItem = { id: "i-1", kind: "spoken", speaker: { id: "n-1", name: "Mira" }, text: "Hello there.", voice: { how: null, key: "k-1" } };

function sit() {
  const live = ref<StoryItem[]>([]);
  let api!: ReturnType<typeof useTableSpeech>;
  const Host = defineComponent({
    setup() {
      api = useTableSpeech({ campaignId: () => "c-1", sessionId: () => "s-1", live: () => live.value, played: () => null });
      return () => h("div");
    },
  });
  const wrapper = mount(Host);
  return { api, live, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handing lines to the voices", () => {
  it("hands a keyed line over once, however often the story is touched again", async () => {
    const { live } = sit();
    live.value = [said];
    await nextTick();
    live.value = [said, { id: "i-2", kind: "margin", text: "Quiet.", count: 1 }];
    await nextTick();
    const spoken = voice().say.mock.calls.flatMap(([lines]) => lines as Array<{ key: string }>);
    expect(spoken.map((line) => line.key)).toEqual(["k-1"]);
  });

  it("reads a line again after another sitting was opened on the page", async () => {
    const { live, api } = sit();
    live.value = [said];
    await nextTick();
    api.restart();
    live.value = [{ ...said }];
    await nextTick();
    const spoken = voice().say.mock.calls.flatMap(([lines]) => lines as Array<{ key: string }>);
    expect(spoken.map((line) => line.key)).toEqual(["k-1", "k-1"]);
    expect(voice().stop).toHaveBeenCalled();
  });

  it("hears anything on the page again, keyed or not", () => {
    const { api } = sit();
    api.onReplay({ ...said, voice: undefined });
    expect(voice().replay).toHaveBeenCalledWith([expect.objectContaining({ text: "Hello there.", key: null })]);
  });
});

describe("when the voices cannot go on", () => {
  it("says so and switches them all off when the server has no voices", async () => {
    sit();
    voice().unavailable.value = true;
    await nextTick();
    expect(mocks.error).toHaveBeenCalledWith("Voices are not switched on for this server.");
    expect(voice().setAllOff).toHaveBeenCalled();
  });

  it("says nothing when the voices come back", async () => {
    sit();
    voice().unavailable.value = true;
    await nextTick();
    mocks.error.mockClear();
    voice().unavailable.value = false;
    await nextTick();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("tells the player the allowance is used up, and that the story goes on in text", async () => {
    sit();
    voice().spent.value = true;
    await nextTick();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("used up their allowance"));
  });

  it.each([["spent", "used up their allowance"], ["broke", "out of credits"]] as const)("says nothing when %s goes back to false", async (flag, words) => {
    sit();
    voice()[flag].value = true;
    await nextTick();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining(words));
    mocks.error.mockClear();
    voice()[flag].value = false;
    await nextTick();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("tells the player they are out of credits", async () => {
    sit();
    voice().broke.value = true;
    await nextTick();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("out of credits"));
  });

  it("stops the voices when the page goes", () => {
    const { wrapper } = sit();
    wrapper.unmount();
    expect(voice().stop).toHaveBeenCalled();
  });
});
