import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonEntry } from "@/types/canon.types";

const mocks = vi.hoisted(() => ({ create: vi.fn(), prompt: { value: "A dreamlike country.\n\nSomething sours." as string | null } }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutate: mocks.create, isPending: ref(false) }),
}));
vi.mock("@/composables/campaign/useSettingContent", () => ({
  useSettingContent: () => ({ data: ref(mocks.prompt.value === null ? null : { defaultAiPrompt: mocks.prompt.value }) }),
}));

import PremisePitch from "./PremisePitch.vue";

const pitch = { id: "p1", part: "premise", premise_kind: "pitch" } as CanonEntry;
const PitchStub = { name: "PitchEditor", template: "<div data-testid='pitch-editor' />" };

function mountPitch(pitches: CanonEntry[], calendarId: string | null) {
  return mount(PremisePitch, { props: { pitches, calendarId }, global: { stubs: { PitchEditor: PitchStub } } });
}

const startButton = (w: ReturnType<typeof mountPitch>) => w.findAll("button").find((b) => b.text().startsWith("Start from"));

describe("PremisePitch", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.prompt.value = "A dreamlike country.\n\nSomething sours.";
  });

  it("offers 'Start from <world>' while there is no pitch, named for the world", () => {
    expect(startButton(mountPitch([], "eberron"))?.text()).toBe("Start from Eberron");
  });

  it("never offers it beside an existing pitch, so it cannot overwrite what the DM wrote", () => {
    const w = mountPitch([pitch], "eberron");
    expect(startButton(w)).toBeUndefined();
    expect(w.find("[data-testid=pitch-editor]").exists()).toBe(true);
  });

  it("offers no start for a world that has no text of its own (custom or homebrew)", () => {
    expect(startButton(mountPitch([], "custom"))).toBeUndefined();
    expect(startButton(mountPitch([], null))).toBeUndefined();
  });

  it("starts a DM-only pitch from the world's text as a document, one paragraph per block", async () => {
    await startButton(mountPitch([], "eberron"))!.trigger("click");
    const input = mocks.create.mock.calls[0]![0];
    expect(input).toMatchObject({ part: "premise", premise_kind: "pitch", player_visible_to: [] });
    expect(JSON.parse(input.body).content).toHaveLength(2);
  });
});
