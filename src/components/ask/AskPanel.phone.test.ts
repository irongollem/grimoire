// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import { useAskUiStore } from "@/stores/ui/ask";
import { _resetModalStack, useModalStack } from "@/components/common/overlays/modalStack";

vi.mock("vue-router", () => ({ useRoute: () => ({ fullPath: "/x", path: "/x", query: {}, meta: {} }), useRouter: () => ({ push: vi.fn() }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({ ...(await importOriginal<object>()), useIsMobile: () => ref(true) }));
vi.mock("@/lib/motion", () => ({ railTransition: () => ({}), drawerTransition: () => ({}), prefersReducedMotion: () => true }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ openOutOfCredits: vi.fn() }) }));
vi.mock("@/composables/ask/askUsage", () => ({ useAskUsage: () => ({ freeLeft: ref(5), refetch: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { name: "K" } }) }));
vi.mock("@/ai/ask/useAskAdapters", () => ({ useAskAdapters: () => ({ adapterFor: () => undefined, screenFor: () => undefined }) }));

vi.mock("@/composables/table/useTableVoice", async (importOriginal) => ({ ...(await importOriginal<object>()), useTableVoiceRates: () => ({ data: ref(undefined) }) }));

import AskPanel from "./AskPanel.vue";

const stubs = { Teleport: true, Transition: false, RouterLink: { template: "<a><slot /></a>" } };

/** What a dialog opened from inside the sheet does: claims its layer in the modal stack, like every AppModal. */
const Dialog = defineComponent({
  props: { open: { type: Boolean, required: true } },
  setup(props) {
    const z = useModalStack(() => props.open);
    return () => h("div", { "data-testid": "dialog", style: { zIndex: z.value ?? undefined } });
  },
});

describe("AskPanel on a phone", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    _resetModalStack();
  });
  afterEach(() => _resetModalStack());

  // Bug caught: the sheet sat at a fixed z-[910] while every dialog starts at 200, so the "Start over?" confirm, the
  // paywalls and the report form opened behind the sheet and a tap closed the sheet with the promise pending.
  it("paints below a dialog opened from inside it, and above a modal it was opened from", async () => {
    const before = mount(Dialog, { props: { open: true } });
    const wrapper = mount(AskPanel, { global: { stubs } });
    useAskUiStore().openPanel();
    await flushPromises();
    const sheet = wrapper.find('[role="dialog"]').element as HTMLElement;
    const sheetZ = Number(sheet.style.zIndex);
    const beforeZ = Number((before.find('[data-testid="dialog"]').element as HTMLElement).style.zIndex);
    expect(sheetZ).toBeGreaterThan(beforeZ);
    const after = mount(Dialog, { props: { open: true } });
    expect(Number((after.find('[data-testid="dialog"]').element as HTMLElement).style.zIndex)).toBeGreaterThan(sheetZ);
  });
});
