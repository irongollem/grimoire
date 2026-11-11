import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const startChroniclerImage = vi.fn();
const requireCredits = vi.fn(() => true);
const ensureLikenessAck = vi.fn(async () => true);
const costOf = vi.fn((_key: string, opts?: { size?: string }) => (opts?.size === "1536x1024" || opts?.size === "1024x1536" ? 15 : 10));
let portraitUrl: string | null = null;

vi.mock("@/ai/useChroniclerImageGeneration", () => ({ startChroniclerImage: (...a: unknown[]) => startChroniclerImage(...a) }));
vi.mock("@/ai/sceneEntities", () => ({
  mentionedLocationIds: () => [],
  mentionedNpcIds: () => [],
  parseSceneEntities: () => (portraitUrl ? [{ label: "Aria", portraitUrl, textDescription: "" }] : []),
}));
vi.mock("@/composables/npcs/useNpcFields", () => ({ useNpcAppearances: () => ({ data: ref(undefined) }) }));
vi.mock("@/composables/locations/useLocationDescriptions", () => ({ useLocationDescriptions: () => ({ data: ref(undefined) }) }));
vi.mock("@/composables/monsters/useMentionedMonsters", () => ({ useMentionedMonsters: () => ref([]) }));
vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: () => ({
    mentionItems: ref([]), partyMembers: ref([]), npcs: ref([]), monsterIndex: ref([]), locations: ref([]), factions: ref([]),
  }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: ref("c1"), activeCampaign: { group_portrait_url: null } }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: ref({ id: "u1" }) }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ imageCredits: (n: number) => n, imageIsByok: ref(false) }),
}));
vi.mock("@/composables/ai/useLikenessGate", () => ({ useLikenessGate: () => ({ ensureLikenessAck }) }));

import ChroniclerGenerateDialog from "./ChroniclerGenerateDialog.vue";

const stubs = {
  AppModal: { props: ["open"], template: '<div v-if="open"><slot /></div>' },
  ModalHeader: { props: ["title"], template: "<h2>{{ title }}</h2>" },
  GenerationCostBadge: { props: ["credits"], template: '<span data-testid="cost">{{ credits }}</span>' },
  MentionTextarea: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
};

async function open(props: Record<string, unknown> = {}) {
  const wrapper = mount(ChroniclerGenerateDialog, { props: { visible: false, ...props }, global: { stubs } });
  await wrapper.setProps({ visible: true });
  await wrapper.find("textarea").setValue("A dragon in the ruins");
  return wrapper;
}
async function generate(wrapper: VueWrapper) {
  const button = wrapper.findAll("button").find((b) => b.text().includes("Generate"));
  if (!button) throw new Error("no Generate button");
  await button.trigger("click");
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  portraitUrl = null;
  requireCredits.mockReturnValue(true);
  ensureLikenessAck.mockResolvedValue(true);
  startChroniclerImage.mockResolvedValue({ jobId: "job-1" });
});

describe("ChroniclerGenerateDialog", () => {
  it("offers a note the Square and Landscape it always had, and stays open to queue more", async () => {
    const wrapper = await open();
    expect(wrapper.find('[data-testid="shape-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="shape-landscape"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="shape-"]')).toHaveLength(2);
    await generate(wrapper);
    expect(startChroniclerImage).toHaveBeenCalledWith(expect.objectContaining({ size: "1024x1024" }));
    expect(wrapper.emitted("started")?.[0]?.[0]).toMatchObject({ jobId: "job-1", shape: "square" });
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("offers the shapes it is given, paints the chosen one's oblong and says which shape was chosen", async () => {
    const shapes = [
      { id: "page", label: "Full page", size: "1024x1536" as const },
      { id: "banner", label: "Wide banner", size: "1536x1024" as const },
    ];
    const wrapper = await open({ shapes, closeOnStart: true });
    expect(wrapper.findAll('[data-testid^="shape-"]')).toHaveLength(2);
    await wrapper.find('[data-testid="shape-banner"]').trigger("click");
    expect(wrapper.find('[data-testid="cost"]').text()).toBe("15");
    await generate(wrapper);
    expect(startChroniclerImage).toHaveBeenCalledWith(expect.objectContaining({ size: "1536x1024" }));
    expect(wrapper.emitted("started")?.[0]?.[0]).toMatchObject({ shape: "banner", size: "1536x1024" });
  });

  it("closes once the render is queued when it is asked to, because a picture in a book has only one job", async () => {
    const wrapper = await open({ shapes: [{ id: "page", label: "Full page", size: "1024x1536" }], closeOnStart: true });
    await generate(wrapper);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("starts nothing when the credits are not there", async () => {
    requireCredits.mockReturnValue(false);
    const wrapper = await open();
    await generate(wrapper);
    expect(startChroniclerImage).not.toHaveBeenCalled();
    expect(wrapper.emitted("started")).toBeUndefined();
  });

  it("starts nothing when the DM declines the likeness notice on a scene with a portrait", async () => {
    portraitUrl = "https://x/aria.webp";
    ensureLikenessAck.mockResolvedValue(false);
    const wrapper = await open();
    await generate(wrapper);
    expect(ensureLikenessAck).toHaveBeenCalled();
    expect(startChroniclerImage).not.toHaveBeenCalled();
  });

  it("asks for no likeness notice when no portrait is sent", async () => {
    const wrapper = await open();
    await generate(wrapper);
    expect(ensureLikenessAck).not.toHaveBeenCalled();
    expect(startChroniclerImage).toHaveBeenCalled();
  });
});
