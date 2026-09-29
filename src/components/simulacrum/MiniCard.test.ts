import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MiniCard from "./MiniCard.vue";
import type { Mini } from "@/types/mini.types";

const isAiEnabled = ref(true);

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
  }),
}));
vi.mock("@/composables/simulacrum/useMinis", () => ({
  useDeleteMini: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));

const failedMini = {
  id: "mini-1",
  source_table: "npcs",
  source_id: "npc-1",
  format: "print",
  status: "failed",
  label: "Goblin",
  created_at: "2026-09-01T00:00:00Z",
  thumbnail_url: null,
  stylized_image_url: null,
  glb_path: null,
  stl_path: null,
  provider: "meshy",
} as unknown as Mini;

function mountCard() {
  return mount(MiniCard, {
    props: { mini: failedMini },
    global: { stubs: { RouterLink: RouterLinkStub, AppModal: true, AiGeneratedBadge: true, VitruvianIcon: true } },
  });
}

describe("MiniCard resume", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
  });

  it("offers Resume for an unfinished mini when AI is on", () => {
    expect(mountCard().findComponent(RouterLinkStub).exists()).toBe(true);
  });

  it("hides Resume, not disables it, when the campaign's AI is off", () => {
    isAiEnabled.value = false;
    expect(mountCard().findComponent(RouterLinkStub).exists()).toBe(false);
  });
});
