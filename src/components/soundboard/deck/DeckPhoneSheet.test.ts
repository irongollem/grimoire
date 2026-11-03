import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";

const snapshot = ref({ pages: [{ id: "p", name: "Mill" }], pageIndex: 0, lanes: [], rows: 1, cells: [], tool: "play", lockedTool: "play", hush: false, paused: false, audibleCount: 1, masterVolume: 1 });
// Refs inside a reactive object, as a Pinia store holds its state, so storeToRefs sees them.
const ui = reactive({
  deckSize: ref<"tucked" | "row" | "deck" | "full">("row"),
  deckPeekEnabled: ref(true),
  deckPeekSignal: ref(0),
  deckControls: ref("full"),
});

vi.mock("@/composables/soundboard/useDeck", () => ({ useDeck: () => ({ snapshot, dispatch: vi.fn() }) }));
vi.mock("@/stores/ui/soundboard", () => ({ useSoundboardUiStore: () => ui }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ dmMode: "play" }) }));

const { default: DeckPhoneSheet } = await import("./DeckPhoneSheet.vue");

const stubs = {
  RouterLink: { template: "<a><slot /></a>" },
  DeckGrid: true,
  DeckToolStrip: true,
  DeckTransport: true,
  DeckNowChips: true,
  DeckSettingsPopover: true,
  AppButton: true,
};

async function grab(dy: number) {
  const w = mount(DeckPhoneSheet, { global: { stubs } });
  const grabber = w.get("[data-testid='deck-grabber']");
  await grabber.trigger("pointerdown", { clientY: 500, pointerId: 1 });
  await grabber.trigger("pointerup", { clientY: 500 + dy, pointerId: 1 });
  return w;
}

beforeEach(() => {
  ui.deckSize = "row";
  ui.deckPeekEnabled = true;
});

describe("DeckPhoneSheet's grabber", () => {
  // Fails if the threshold is gone or flipped: a finger that wobbles 20px on a
  // tap would grow the open sheet to full screen instead of folding it.
  it("treats a small wobble as a tap, which folds the open sheet instead of growing it", async () => {
    ui.deckSize = "deck";
    await grab(-20);
    expect(ui.deckSize).toBe("row");
  });

  it("steps the size up on a real drag up, and down on a drag down", async () => {
    await grab(-60);
    expect(ui.deckSize).toBe("deck");
    await grab(60);
    expect(ui.deckSize).toBe("row");
  });

  it("does not step past the largest size", async () => {
    ui.deckSize = "full";
    await grab(-80);
    expect(ui.deckSize).toBe("full");
  });
});
